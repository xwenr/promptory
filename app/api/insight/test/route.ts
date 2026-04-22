import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/insight';

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { success: false, error: '缺少 provider 或 apiKey' },
        { status: 400 },
      );
    }

    const result = await testConnection(provider, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
