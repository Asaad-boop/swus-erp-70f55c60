import { useCallback, useEffect, useRef, useState } from "react";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getSR(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Browser speech-to-text (Chrome/Edge). Calls onText with each finished phrase. */
export function useVoiceTyping(onText: (t: string) => void, lang: "bn-BD" | "en-US" = "bn-BD") {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const supported = !!getSR();

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSR();
    if (!Ctor) {
      setError("Ei browser e voice typing nai — Chrome use koro");
      return;
    }
    setError(null);
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) cb.current(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted")
        setError(e.error === "not-allowed" ? "Mic permission dao" : e.error);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang]);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
