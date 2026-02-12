"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  PHASE_TRACKS,
  pickTrackNoImmediateRepeat,
  resolveBucketByTimeLimit,
  type KahootTimeBucket,
} from "@/lib/audio/kahoot-tracks";

type BgmPlayOptions = {
  loop?: boolean;
};

type PendingReplayAction = () => void;

const INITIAL_BUCKET_TRACKS: Record<KahootTimeBucket, string | null> = {
  "5s": null,
  "10s": null,
  "20s": null,
  "30s": null,
  "60s": null,
  "90s": null,
  "120s": null,
};

function ensureAudioElement(ref: MutableRefObject<HTMLAudioElement | null>): HTMLAudioElement {
  if (!ref.current) {
    ref.current = new Audio();
    ref.current.preload = "auto";
  }
  return ref.current;
}

export function useAdminKahootAudio() {
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const currentBgmTrackRef = useRef<string | null>(null);
  const lastBucketTrackRef = useRef<Record<KahootTimeBucket, string | null>>(INITIAL_BUCKET_TRACKS);
  const pendingReplayActionRef = useRef<PendingReplayAction | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const playBgm = useCallback((track: string, options?: BgmPlayOptions) => {
    const bgm = ensureAudioElement(bgmRef);
    const shouldLoop = options?.loop ?? true;
    const isSameTrack = currentBgmTrackRef.current === track;

    bgm.loop = shouldLoop;
    if (isSameTrack && !bgm.paused) return;

    if (!isSameTrack) {
      bgm.pause();
      bgm.src = track;
      bgm.currentTime = 0;
      currentBgmTrackRef.current = track;
    }

    void bgm.play().then(
      () => {
        setAutoplayBlocked(false);
      },
      () => {
        setAutoplayBlocked(true);
        pendingReplayActionRef.current = () => {
          playBgm(track, options);
        };
      }
    );
  }, []);

  const stopQuestionLoop = useCallback(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    bgm.pause();
    bgm.currentTime = 0;
    currentBgmTrackRef.current = null;
  }, []);

  const playSfxOnce = useCallback((track: string) => {
    const sfx = ensureAudioElement(sfxRef);
    sfx.pause();
    sfx.src = track;
    sfx.loop = false;
    sfx.currentTime = 0;
    void sfx.play().then(
      () => {
        setAutoplayBlocked(false);
      },
      () => {
        setAutoplayBlocked(true);
        pendingReplayActionRef.current = () => {
          playSfxOnce(track);
        };
      }
    );
  }, []);

  const playLobbyLoop = useCallback(() => {
    playBgm(PHASE_TRACKS.lobby, { loop: true });
  }, [playBgm]);

  const playQuestionLoop = useCallback(
    (timeLimitSeconds: number) => {
      const bucket = resolveBucketByTimeLimit(timeLimitSeconds);
      const lastTrack = lastBucketTrackRef.current[bucket];
      const selectedTrack = pickTrackNoImmediateRepeat(bucket, lastTrack);
      lastBucketTrackRef.current = {
        ...lastBucketTrackRef.current,
        [bucket]: selectedTrack,
      };
      playBgm(selectedTrack, { loop: true });
    },
    [playBgm]
  );

  const playGongOnce = useCallback(() => {
    stopQuestionLoop();
    playSfxOnce(PHASE_TRACKS.gong);
  }, [playSfxOnce, stopQuestionLoop]);

  const playPodiumLoop = useCallback(() => {
    playBgm(PHASE_TRACKS.podium, { loop: true });
  }, [playBgm]);

  const stopAllKahootAudio = useCallback(() => {
    stopQuestionLoop();
    const sfx = sfxRef.current;
    if (sfx) {
      sfx.pause();
      sfx.currentTime = 0;
    }
    pendingReplayActionRef.current = null;
  }, [stopQuestionLoop]);

  useEffect(() => {
    const resumePendingAudio = () => {
      if (!pendingReplayActionRef.current) return;
      const pendingAction = pendingReplayActionRef.current;
      pendingReplayActionRef.current = null;
      pendingAction();
    };

    window.addEventListener("pointerdown", resumePendingAudio);
    window.addEventListener("keydown", resumePendingAudio);
    return () => {
      window.removeEventListener("pointerdown", resumePendingAudio);
      window.removeEventListener("keydown", resumePendingAudio);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopAllKahootAudio();
      if (bgmRef.current) {
        bgmRef.current.src = "";
      }
      if (sfxRef.current) {
        sfxRef.current.src = "";
      }
    };
  }, [stopAllKahootAudio]);

  return {
    autoplayBlocked,
    playLobbyLoop,
    playQuestionLoop,
    playGongOnce,
    playPodiumLoop,
    stopQuestionLoop,
    stopAllKahootAudio,
  };
}
