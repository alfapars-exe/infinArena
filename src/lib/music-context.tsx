"use client";

import React, { createContext, useContext, useRef, useState, useEffect, ReactNode } from "react";

const MUSIC_STORAGE_KEY = "infinarena:music";

type StoredMusic = {
  youtubeVideoId?: string | null;
  volume?: number;
  isRepeat?: boolean;
  isPlaying?: boolean;
};

interface MusicContextValue {
  youtubeVideoId: string | null;
  isPlaying: boolean;
  volume: number;
  isRepeat: boolean;
  isPlayerReady: boolean;
  togglePlay: () => void;
  changeVolume: (volume: number) => void;
  toggleRepeat: () => void;
  changeVideo: (videoId: string) => void;
  clearVideo: () => void;
  extractVideoId: (url: string) => string | null;
}

const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusicPlayer() {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error("useMusicPlayer must be used within MusicProvider");
  }
  return context;
}

interface MusicProviderProps {
  children: ReactNode;
}

export function MusicProvider({ children }: MusicProviderProps) {
  const playerRef = useRef<any>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [musicState, setMusicState] = useState<StoredMusic>({
    youtubeVideoId: null,
    volume: 30,
    isRepeat: true,
    isPlaying: false,
  });

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if API already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      loadMusicSettings();
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    (window as any).onYouTubeIframeAPIReady = () => {
      loadMusicSettings();
    };
  }, []);

  const loadMusicSettings = () => {
    const stored = localStorage.getItem(MUSIC_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setMusicState(parsed);
        if (parsed.youtubeVideoId) {
          initializePlayer(parsed.youtubeVideoId, parsed.volume || 30, parsed.isPlaying || false);
        }
      } catch (e) {
        console.error("Failed to parse music settings:", e);
      }
    }
  };

  const initializePlayer = (videoId: string, volume: number, autoplay: boolean) => {
    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      playerRef.current.setVolume(volume);
      if (autoplay) {
        playerRef.current.playVideo();
      }
      return;
    }

    playerRef.current = new (window as any).YT.Player("youtube-music-player", {
      height: "0",
      width: "0",
      videoId: videoId,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (event: any) => {
          setIsPlayerReady(true);
          event.target.setVolume(volume);
          if (autoplay) {
            event.target.playVideo();
          }
        },
        onStateChange: (event: any) => {
          if (event.data === (window as any).YT.PlayerState.ENDED && musicState.isRepeat) {
            event.target.playVideo();
          }
        },
      },
    });
  };

  const updateMusicState = (updates: Partial<StoredMusic>) => {
    const newState = { ...musicState, ...updates };
    setMusicState(newState);
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(newState));
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    const newIsPlaying = !musicState.isPlaying;
    if (newIsPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
    updateMusicState({ isPlaying: newIsPlaying });
  };

  const changeVolume = (newVolume: number) => {
    if (!playerRef.current) return;
    playerRef.current.setVolume(newVolume);
    updateMusicState({ volume: newVolume });
  };

  const toggleRepeat = () => {
    updateMusicState({ isRepeat: !musicState.isRepeat });
  };

  const changeVideo = (videoId: string) => {
    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      playerRef.current.setVolume(musicState.volume ?? 30);
      if (musicState.isPlaying ?? false) {
        playerRef.current.playVideo();
      }
    } else {
      initializePlayer(videoId, musicState.volume ?? 30, musicState.isPlaying ?? false);
    }
    updateMusicState({ youtubeVideoId: videoId });
  };

  const clearVideo = () => {
    if (playerRef.current) {
      playerRef.current.stopVideo();
    }
    updateMusicState({
      youtubeVideoId: null,
      isPlaying: false,
    });
  };

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  const value: MusicContextValue = {
    youtubeVideoId: musicState.youtubeVideoId ?? null,
    isPlaying: musicState.isPlaying ?? false,
    volume: musicState.volume ?? 30,
    isRepeat: musicState.isRepeat ?? true,
    isPlayerReady,
    togglePlay,
    changeVolume,
    toggleRepeat,
    changeVideo,
    clearVideo,
    extractVideoId,
  };

  return (
    <MusicContext.Provider value={value}>
      <div id="youtube-music-player" style={{ display: "none" }} />
      {children}
    </MusicContext.Provider>
  );
}
