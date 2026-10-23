import React from 'react';

// Central config for AI logos and official API key links
export const AI_PROVIDERS = {
  gemini: {
    id: "gemini",
    name: "Gemini",
    pic: "/gemini.svg",
    keyUrl: "https://aistudio.google.com/app/apikey",
  },
  openai: {
    id: "openai",
    name: "ChatGPT",
    pic: "/openai.svg",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  claude: {
    id: "claude",
    name: "Claude",
    pic: "/claude.svg",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  groq: {
    id: "groq",
    name: "Groq",
    pic: "/groq.svg",
    keyUrl: "https://console.groq.com/keys",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    pic: "/deepseek.svg",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  stockfish: {
    id: "stockfish",
    name: "Stockfish",
    pic: "/stockfish.svg",
  },
};

const PlayerInfo = ({ name = "Player", level = 700, pic, llmId, flag, isThinking = false }) => {
  const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236b7280'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

  // Automatically pick the LLM's default picture if llmId is passed and no custom pic overrides it
  const resolvedPic = pic || (llmId && AI_PROVIDERS[llmId]?.pic) || defaultAvatar;

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Avatar with Animated Spinner Overlay */}
      <div className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0 bg-[#312e2b] rounded flex items-center justify-center overflow-hidden border border-white/5 relative">
        <img 
          src={resolvedPic} 
          alt={`${name} avatar`} 
          className={`w-full h-full object-cover transition-opacity duration-300 ${isThinking ? 'opacity-30' : 'opacity-100'}`}
          onError={(e) => { e.currentTarget.src = defaultAvatar; }}
        />
        {isThinking && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-[#81b64c] border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Details Stacked Vertically */}
      <div className="flex flex-col justify-center">
        {/* Top Row: Name, Level, Flag */}
        <div className="flex items-center gap-1.5 font-sans">
          <span className="text-white font-bold text-sm md:text-base leading-none">
            {name}
          </span>
          <span className="text-gray-400 text-xs md:text-sm font-medium leading-none">
            ({level})
          </span>
          {flag && (
            <span className="ml-0.5 text-xs md:text-sm leading-none" aria-hidden="true">
              {flag}
            </span>
          )}
        </div>
        
        {/* Bottom Row: Fixed-height container prevents UI jumping */}
        <div className="h-3 mt-1 flex items-center">
          {isThinking && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#81b64c] animate-pulse">
              Calculating...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerInfo;