import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  buildAnalysisPrompt,
  parseInsightResponse,
  callAIStream,
} from '@/lib/insight';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cluster, scene } = body;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        if (!cluster || !scene) {
          send('error', { error: '缺少 cluster 或 scene' });
          return;
        }

        send('progress', { percent: 5, message: '正在验证身份...' });

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          send('error', { error: '未登录' });
          return;
        }

        send('progress', { percent: 10, message: '正在读取 API 配置...' });

        const { data: apiConfig } = await supabase
          .from('api_configs')
          .select()
          .eq('user_id', user.id)
          .single();

        if (!apiConfig) {
          send('error', { error: '请先在设置中配置 AI API Key' });
          return;
        }

        send('progress', { percent: 18, message: '正在查询 Prompt 记录...' });

        const { data: prompts } = await supabase
          .from('prompts')
          .select('*, prompt_versions(*)')
          .eq('user_id', user.id)
          .eq('scene', scene)
          .contains('goal_clusters', [cluster]);

        if (!prompts || prompts.length === 0) {
          send('error', { error: `「${cluster}」下没有 Prompt 记录` });
          return;
        }

        send('progress', { percent: 25, message: '正在整理数据...' });

        interface PromptData {
          title: string;
          content: string;
          score: number;
          goal: string;
        }

        const allPromptData: PromptData[] = [];
        const highScorePrompts: PromptData[] = [];
        const lowScorePrompts: PromptData[] = [];

        for (const p of prompts) {
          const versions = p.prompt_versions || [];
          for (const v of versions) {
            if (v.effect_score != null) {
              const d: PromptData = {
                title: p.title,
                content: v.content,
                score: v.effect_score,
                goal: p.goal,
              };
              allPromptData.push(d);
              if (v.effect_score >= 4) highScorePrompts.push(d);
              if (v.effect_score <= 2) lowScorePrompts.push(d);
            }
          }
        }

        if (allPromptData.length < 3) {
          send('error', {
            error: `需要至少 3 条有评分的记录，当前只有 ${allPromptData.length} 条`,
          });
          return;
        }

        if (highScorePrompts.length === 0) {
          send('error', { error: '没有找到评分 ≥ 4 的高分 Prompt' });
          return;
        }

        send('progress', { percent: 30, message: 'AI 正在分析...' });

        const analysisPrompt = buildAnalysisPrompt(
          cluster,
          highScorePrompts,
          lowScorePrompts,
        );

        let fullText = '';
        let chunkCount = 0;

        for await (const chunk of callAIStream(
          apiConfig.provider as 'kimi' | 'gemini' | 'deepseek' | 'openai' | 'claude',
          apiConfig.api_key,
          analysisPrompt,
        )) {
          fullText += chunk;
          chunkCount++;
          if (chunkCount % 5 === 0) {
            const pct = 30 + 55 * (1 - 1 / (1 + chunkCount / 200));
            send('progress', {
              percent: Math.round(pct),
              message: 'AI 正在生成...',
            });
          }
        }

        send('progress', { percent: 88, message: '正在解析分析结果...' });

        console.log(
          `[Insight] raw AI response: ${fullText.length} chars, ends with: ...${fullText.slice(-120)}`,
        );

        const insight = parseInsightResponse(
          fullText,
          cluster,
          highScorePrompts.length,
          lowScorePrompts.length,
          prompts.length,
        );

        if (!insight.bestTemplate) {
          console.warn('[Insight] bestTemplate is empty after parsing');
        }

        send('progress', { percent: 95, message: '分析完成' });
        send('done', { success: true, data: insight });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Insight analysis error:', msg);
        send('error', { error: `分析失败：${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
