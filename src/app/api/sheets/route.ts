import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleSheetData } from "@/lib/sheets";

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  const headerPass = req.headers.get("x-admin-password") || "";
  return headerPass === adminPassword;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Неверный пароль администратора" }, { status: 401 });
  }

  try {
    const { sheetUrl, headerRowIndex = 0 } = await req.json();
    const data = await fetchGoogleSheetData(sheetUrl, Number(headerRowIndex) || 0);
    return NextResponse.json({ ok: true, ...data });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Ошибка при чтении Google Таблицы",
      },
      { status: 400 }
    );
  }
}

