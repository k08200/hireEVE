"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Locale = "en" | "ko";

// Translation dictionaries
const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Nav
    "nav.dashboard": "Dashboard",
    "nav.chat": "Chat",
    "nav.email": "Email",
    "nav.calendar": "Calendar",
    "nav.tasks": "Tasks",
    "nav.notes": "Notes",
    "nav.contacts": "Contacts",
    "nav.reminders": "Reminders",
    "nav.auto": "Auto",
    // Auth
    "auth.signIn": "Sign in",
    "auth.signUp": "Create account",
    "auth.signingIn": "Signing in...",
    "auth.creatingAccount": "Creating account...",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.name": "Name",
    "auth.noAccount": "Don't have an account? Sign up",
    "auth.hasAccount": "Already have an account? Sign in",
    "auth.tryDemo": "Try Demo (no sign-up needed)",
    "auth.backHome": "Back to home",
    "auth.welcome": "Welcome back!",
    "auth.accountCreated": "Account created!",
    // Settings
    "settings.title": "Settings",
    "settings.subtitle": "Manage your profile, integrations, and preferences",
    "settings.profile": "Profile",
    "settings.security": "Security",
    "settings.integrations": "Integrations",
    "settings.displayName": "Display Name",
    "settings.language": "Language",
    "settings.timezone": "Timezone",
    "settings.saveProfile": "Save Profile",
    "settings.saved": "Saved!",
    "settings.currentPassword": "Current Password",
    "settings.newPassword": "New Password",
    "settings.changePassword": "Change Password",
    "settings.changing": "Changing...",
    "settings.connected": "Connected",
    "settings.disconnect": "Disconnect",
    "settings.connect": "Connect",
    "settings.envVars": "Set env vars to enable",
    "settings.quickActions": "Quick Actions",
    "settings.dailyBriefing": "Daily Briefing",
    "settings.generateNow": "Generate Now",
    "settings.capabilities": "EVE Capabilities",
    "settings.data": "Data",
    "settings.exportData": "Export Data",
    "settings.export": "Export",
    "settings.dangerZone": "Danger Zone",
    "settings.deleteAll": "Delete All Data",
    "settings.deleteBtn": "Delete All",
    "settings.about": "About",
    // Dashboard
    "dashboard.greeting": "Good {timeOfDay}, {name}",
    "dashboard.morning": "morning",
    "dashboard.afternoon": "afternoon",
    "dashboard.evening": "evening",
    // Chat
    "chat.newConversation": "New conversation",
    "chat.typeMessage": "Type a message...",
    "chat.send": "Send",
    // Common
    "common.loading": "Loading...",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.delete": "Delete",
    "common.save": "Save",
    "common.or": "or",
  },
  ko: {
    // Nav
    "nav.dashboard": "대시보드",
    "nav.chat": "채팅",
    "nav.email": "이메일",
    "nav.calendar": "캘린더",
    "nav.tasks": "할 일",
    "nav.notes": "메모",
    "nav.contacts": "연락처",
    "nav.reminders": "리마인더",
    "nav.auto": "자동화",
    // Auth
    "auth.signIn": "로그인",
    "auth.signUp": "회원가입",
    "auth.signingIn": "로그인 중...",
    "auth.creatingAccount": "계정 생성 중...",
    "auth.email": "이메일",
    "auth.password": "비밀번호",
    "auth.name": "이름",
    "auth.noAccount": "계정이 없으신가요? 회원가입",
    "auth.hasAccount": "이미 계정이 있으신가요? 로그인",
    "auth.tryDemo": "데모 체험 (가입 불필요)",
    "auth.backHome": "홈으로 돌아가기",
    "auth.welcome": "다시 오셨군요!",
    "auth.accountCreated": "계정이 생성되었습니다!",
    // Settings
    "settings.title": "설정",
    "settings.subtitle": "프로필, 연동, 환경설정을 관리하세요",
    "settings.profile": "프로필",
    "settings.security": "보안",
    "settings.integrations": "연동",
    "settings.displayName": "표시 이름",
    "settings.language": "언어",
    "settings.timezone": "시간대",
    "settings.saveProfile": "프로필 저장",
    "settings.saved": "저장됨!",
    "settings.currentPassword": "현재 비밀번호",
    "settings.newPassword": "새 비밀번호",
    "settings.changePassword": "비밀번호 변경",
    "settings.changing": "변경 중...",
    "settings.connected": "연결됨",
    "settings.disconnect": "연결 해제",
    "settings.connect": "연결",
    "settings.envVars": "환경변수 설정 필요",
    "settings.quickActions": "빠른 실행",
    "settings.dailyBriefing": "일일 브리핑",
    "settings.generateNow": "지금 생성",
    "settings.capabilities": "EVE 기능 목록",
    "settings.data": "데이터",
    "settings.exportData": "데이터 내보내기",
    "settings.export": "내보내기",
    "settings.dangerZone": "위험 구역",
    "settings.deleteAll": "전체 데이터 삭제",
    "settings.deleteBtn": "전체 삭제",
    "settings.about": "정보",
    // Dashboard
    "dashboard.greeting": "{name}님, 좋은 {timeOfDay}입니다",
    "dashboard.morning": "아침",
    "dashboard.afternoon": "오후",
    "dashboard.evening": "저녁",
    // Chat
    "chat.newConversation": "새 대화",
    "chat.typeMessage": "메시지를 입력하세요...",
    "chat.send": "전송",
    // Common
    "common.loading": "로딩 중...",
    "common.cancel": "취소",
    "common.confirm": "확인",
    "common.delete": "삭제",
    "common.save": "저장",
    "common.or": "또는",
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem("eve-profile");
    if (stored) {
      const { language } = JSON.parse(stored);
      if (language === "ko") return "ko";
      if (language === "en") return "en";
    }
  } catch {
    // ignore
  }
  // Auto-detect from browser
  if (typeof navigator !== "undefined") {
    const lang = navigator.language || "";
    if (lang.startsWith("ko")) return "ko";
  }
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>): string => {
      let str = translations[locale]?.[key] || translations.en[key] || key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, v);
        }
      }
      return str;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
