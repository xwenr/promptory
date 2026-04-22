import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  buildAnalysisPrompt,
  parseInsightResponse,
  callAI,
  estimateTokens,
} from '@/lib/insight';

export async function POST(req: NextRequest) {
  try {
    const { cluster, scene } = await req.json();

    if (!cluster || !scene) {
      return NextResponse.json(
        { success: false, error: '缺少 cluster 或 scene' },
        { status: 400 },
      );
    }

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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 },
      );
    }

    const { data: apiConfig } = await supabase
      .from('api_configs')
      .select()
      .eq('user_id', user.id)
      .single();

    if (!apiConfig) {
      return NextResponse.json(
        { success: false, error: '请先在设置中配置 AI API Key' },
        { status: 400 },
      );
    }

    const { data: prompts } = await supabase
      .from('prompts')
      .select('*, prompt_versions(*)')
      .eq('user_id', user.id)
      .eq('scene', scene)
      .contains('goal_clusters', [cluster]);

    if (!prompts || prompts.length === 0) {
      return NextResponse.json(
        { success: false, error: `「${cluster}」下没有 Prompt 记录` },
        { status: 400 },
      );
    }

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
          const data: PromptData = {
            title: p.title,
            content: v.content,
            score: v.effect_score,
            goal: p.goal,
          };
          allPromptData.push(data);
          if (v.effect_score >= 4) highScorePrompts.push(data);
          if (v.effect_score <= 2) lowScorePrompts.push(data);
        }
      }
    }

    if (allPromptData.length < 3) {
      return NextResponse.json(
        { success: false, error: `需要至少 3 条有评分的记录，当前只有 ${allPromptData.length} 条` },
        { status: 400 },
      );
    }

    if (highScorePrompts.length === 0) {
      return NextResponse.json(
        { success: false, error: '没有找到评分 ≥ 4 的高分 Prompt' },
        { status: 400 },
      );
    }

    const tokensEstimate = estimateTokens([...highScorePrompts, ...lowScorePrompts]);
    const analysisPrompt = buildAnalysisPrompt(cluster, highScorePrompts, lowScorePrompts);

    const rawResponse = await callAI(
      apiConfig.provider as 'kimi' | 'gemini' | 'deepseek' | 'openai' | 'claude',
      apiConfig.api_key,
      analysisPrompt,
    );

    const insight = parseInsightResponse(
      rawResponse,
      cluster,
      highScorePrompts.length,
      lowScorePrompts.length,
      prompts.length,
    );

    return NextResponse.json({
      success: true,
      data: insight,
      tokensUsed: tokensEstimate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Insight analysis error:', msg);
    return NextResponse.json(
      { success: false, error: `分析失败：${msg}` },
      { status: 500 },
    );
  }
}
