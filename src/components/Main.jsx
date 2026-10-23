import { useEffect, useRef, useState } from "react";
import Square from "./Square";
import { Chess } from "chess.js";
import right from "/right.svg";
import left from "/left.svg";
import PlayerInfo, { AI_PROVIDERS } from "./PlayerInfo";
import { useLLMEngine } from "./useLLMEngine";

const LLM_LIST = ["gemini", "openai", "claude", "groq", "deepseek"];

// --- ARROW COMPONENT ---
const ArrowOverlay = ({ arrows, orientation }) => {
  if (!arrows || arrows.length === 0) return null;
  const getCoords = (square) => {
    if (!square) return { x: 0, y: 0 };
    const col = square.charCodeAt(0) - 97; 
    const row = 8 - parseInt(square[1]);
    const x = (orientation === 'w' ? col : 7 - col) * 12.5 + 6.25;
    const y = (orientation === 'w' ? row : 7 - row) * 12.5 + 6.25;
    return { x, y };
  };
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible" viewBox="0 0 100 100">
      <defs>
        <marker id="arrow-user" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill="#fb923c" />
        </marker>
        <linearGradient id="liquidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9168c0"><animate attributeName="stop-color" values="#9168c0; #5684d1; #1ba1e3; #9168c0" dur="2s" repeatCount="indefinite" /></stop>
          <stop offset="100%" stopColor="#1ba1e3"><animate attributeName="stop-color" values="#1ba1e3; #9168c0; #5684d1; #1ba1e3" dur="2s" repeatCount="indefinite" /></stop>
        </linearGradient>
        <marker id="arrow-gm" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" fill="url(#liquidGrad)" />
        </marker>
      </defs>
      {arrows.map((arrow, i) => {
        const start = getCoords(arrow.from);
        const end = getCoords(arrow.to);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const shorten = 2.5; 
        const endX = end.x - (dx / len) * shorten;
        const endY = end.y - (dy / len) * shorten;
        const isGM = arrow.type === 'gm';
        return (
          <line 
            key={i} x1={start.x} y1={start.y} x2={endX} y2={endY}
            stroke={isGM ? "url(#liquidGrad)" : "#fb923c"}
            strokeWidth="1.8" 
            markerEnd={isGM ? "url(#arrow-gm)" : "url(#arrow-user)"}
            opacity="0.9" strokeLinecap="butt"
          />
        );
      })}
    </svg>
  );
};

export default function Main() {
  const chessGameRef = useRef(new Chess());
  const engineRef = useRef(null);
  
  const historyScrollRef = useRef(null);
  const mobileHistoryScrollRef = useRef(null);

  const [board, setBoard] = useState(chessGameRef.current.board());
  const [possibleMoves, setpossibleMoves] = useState([]);
  const [clickedSquare, setClickedSquare] = useState(null);
  const [draggedSquare, setDraggedSquare] = useState(null);
  const [turn, setTurn] = useState('w');
  const [history, setHistory] = useState([]);
  const [fenHistory, setFenHistory] = useState([chessGameRef.current.fen()]);
  const [viewIndex, setViewIndex] = useState(-1);

  const [gameOver, setGameOver] = useState(null);
  const [checkSquare, setCheckSquare] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [hoveredSquare, sethoveredSquare] = useState(null);
  const [lastMove, setLastMove] = useState(null); 

  // --- PvE / EvE / PvP CONTROLLERS ---
  // Options: 'human' | 'llm' | 'stockfish'
  const [whitePlayer, setWhitePlayer] = useState('human');
  const [blackPlayer, setBlackPlayer] = useState('llm');
  const [whiteLlm, setWhiteLlm] = useState('gemini');
  const [blackLlm, setBlackLlm] = useState('gemini');

  // Store API keys per provider in localStorage
  const [apiKeys, setApiKeys] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chess_llm_api_keys")) || {};
    } catch {
      return {};
    }
  });

  // Popup modal state for entering API key & getting link
  const [activeKeyModal, setActiveKeyModal] = useState(null); // 'gemini' | 'openai' | etc.

  const [isStockfishThinking, setIsStockfishThinking] = useState(false);
  const { fetchLLMMove, isLLMThinking, llmError, setLlmError } = useLLMEngine();

  const [gameStarted, setGameStarted] = useState(false);
  const [orientation, setOrientation] = useState('w');
  
  const [evaluation, setEvaluation] = useState(0); 
  const [isMateEval, setIsMateEval] = useState(false);

  const [botElo, setBotElo] = useState(1000);
  const [rightClickStart, setRightClickStart] = useState(null);
  const [arrows, setArrows] = useState([]); 

  const isGameInProgress = gameStarted && !gameOver;
  const currentMoveIndex = viewIndex === -1 ? history.length - 1 : viewIndex;
  const activeController = turn === 'w' ? whitePlayer : blackPlayer;

  const handleSaveApiKey = (providerId, value) => {
    const updated = { ...apiKeys, [providerId]: value };
    setApiKeys(updated);
    localStorage.setItem("chess_llm_api_keys", JSON.stringify(updated));
    if (llmError) setLlmError(null);
  };

  // --- LOGIC ---

  const playSound = (soundName) => {
    const ext = soundName === 'game-end' ? 'webm' : 'mp3';
    new Audio(`/sounds/${soundName}.${ext}`).play().catch(() => {});
  };

  const handleMoveSounds = (move) => {
    if (chessGameRef.current.isGameOver()) playSound('game-end');
    else if (chessGameRef.current.inCheck()) playSound('move-check');
    else if (move.captured) playSound('capture');
    else if (move.flags.includes('k') || move.flags.includes('q')) playSound('castle');
    else if (move.promotion) playSound('promote');
    else playSound(move.color === 'w' ? 'move' : 'move-opponent');
  };

  const updateGameStatus = () => {
    const chessgame = chessGameRef.current;
    setHistory(chessgame.history({ verbose: true }));
    setFenHistory(prev => [...prev, chessgame.fen()]);
    setViewIndex(-1);

    if (chessgame.isGameOver()) {
      if (chessgame.isCheckmate()) {
        setGameOver(`Checkmate! ${chessgame.turn() === 'w' ? 'Black' : 'White'} wins.`);
      } else if (chessgame.isDraw()) {
        setGameOver('Draw!');
      } else {
        setGameOver('Game Over');
      }
    } else if (chessgame.inCheck()) {
      chessgame.board().forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell && cell.type === 'k' && cell.color === chessgame.turn()) setCheckSquare(`${rIdx}-${cIdx}`);
        });
      });
    } else { setCheckSquare(null); }
  };

  const handleMoveUpdates = (move) => {
    setBoard(chessGameRef.current.board());
    setTurn(chessGameRef.current.turn());
    setLastMove({ from: move.from, to: move.to });
    handleMoveSounds(move);
    setArrows([]); 
    updateGameStatus();
  };

  const makeBotMove = (from, to, promotion = "q") => {
    try {
      const move = chessGameRef.current.move({ from, to, promotion });
      if (move) handleMoveUpdates(move);
    } catch (e) {
      console.warn("Invalid bot move attempted:", from, to, e);
    }
  };

  const idToNotation = (id) => {
    if (!id) return null;
    const [row, col] = id.split('-').map(Number);
    return `${String.fromCharCode(97 + col)}${8 - row}`;
  };

  const handleRightClickDown = (squareId, e) => {
    if (e.button === 2) {
      setRightClickStart(squareId);
    }
  };

  const handleRightClickUp = (squareId, e) => {
    if (e.button === 2 && rightClickStart) {
      const from = idToNotation(rightClickStart);
      const to = idToNotation(squareId);
      if (from && to && from !== to) {
        setArrows((prev) => {
          const exists = prev.some((a) => a.from === from && a.to === to && a.type === 'user');
          if (exists) return prev.filter((a) => !(a.from === from && a.to === to && a.type === 'user'));
          return [...prev, { from, to, type: 'user' }];
        });
      }
      setRightClickStart(null);
    }
  };

  const executeMove = (fromId, toId) => {
    const from = idToNotation(fromId);
    const to = idToNotation(toId);
    const moves = chessGameRef.current.moves({ square: from, verbose: true });
    if (moves.some(m => m.to === to && m.promotion)) { setPendingPromotion({ from, to }); return; }
    
    try {
      const move = chessGameRef.current.move({ from, to, promotion: "q" });
      if (move) {
        setBoard(chessGameRef.current.board()); setpossibleMoves([]); setClickedSquare(null); setDraggedSquare(null);
        setTurn(chessGameRef.current.turn()); 
        setLastMove({ from: move.from, to: move.to });
        handleMoveSounds(move); 
        setArrows([]); updateGameStatus();
      } else playSound('illegal');
    } catch {
      playSound('illegal');
    }
  };

  const onSquareClick = (id) => {
    if (viewIndex !== -1) return;
    if (!gameStarted || gameOver || activeController !== 'human') return;
    if (clickedSquare && possibleMoves.some(m => m.id === id)) { executeMove(clickedSquare, id); return; }
    const rawMoves = chessGameRef.current.moves({ square: idToNotation(id), verbose: true });
    if (rawMoves.length > 0) {
      setpossibleMoves(rawMoves.map(m => ({ id: `${8 - parseInt(m.to[1])}-${m.to.charCodeAt(0) - 97}`, isCapture: m.flags.includes('c') || m.flags.includes('e') })));
      setClickedSquare(id);
    } else { setpossibleMoves([]); setClickedSquare(null); }
  };

  const handleDragStart = (id) => {
    if (viewIndex !== -1) return;
    if (!gameStarted || gameOver || activeController !== 'human') return;
    onSquareClick(id); setDraggedSquare(id);
  };
  
  const handleDrop = (targetId) => {
    if (gameOver || !draggedSquare || activeController !== 'human') return;
    onSquareClick(targetId); setDraggedSquare(null);
  };

  const handlePromotion = (pieceType) => {
    const move = chessGameRef.current.move({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: pieceType });
    if (move) { 
      setBoard(chessGameRef.current.board()); setPendingPromotion(null); setTurn(chessGameRef.current.turn()); 
      setpossibleMoves([]); setClickedSquare(null); 
      setLastMove({ from: move.from, to: move.to }); 
      handleMoveSounds(move); setArrows([]); updateGameStatus(); 
    }
  };

  const resetGame = () => {
    chessGameRef.current.reset();
    setBoard(chessGameRef.current.board());
    setTurn('w');
    setCheckSquare(null);
    setGameOver(null);
    setpossibleMoves([]);
    setClickedSquare(null);
    setHistory([]);
    setFenHistory([chessGameRef.current.fen()]);
    setViewIndex(-1);
    setEvaluation(0);
    setIsMateEval(false);
    setGameStarted(false);
    setIsStockfishThinking(false);
    setArrows([]);
    setLastMove(null);
  };

  const startGame = () => {
    if (whitePlayer !== 'human' && blackPlayer === 'human') {
      setOrientation('b');
    } else if (whitePlayer === 'human' && blackPlayer !== 'human') {
      setOrientation('w');
    }
    playSound("game-start");
    setGameStarted(true);
  };

  const goBack = () => { setViewIndex((prev) => { playSound('move'); if (prev === -1) return Math.max(0, history.length - 1); return Math.max(0, prev - 1); }); };
  const goForward = () => { setViewIndex((prev) => { playSound('move'); if (prev === -1 || prev >= history.length - 1) return -1; return prev + 1; }); };

  // --- EFFECTS ---
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === "ArrowLeft") goBack(); if (e.key === "ArrowRight") goForward(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history.length]);

  useEffect(() => {
    if (historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
    if (mobileHistoryScrollRef.current) {
      mobileHistoryScrollRef.current.scrollLeft = mobileHistoryScrollRef.current.scrollWidth;
    }
  }, [history]);

  // Initialize Stockfish Worker
  useEffect(() => {
    const engine = new Worker("/stockfish.js");
    engineRef.current = engine;
    engine.postMessage("uci");
    return () => engine.terminate();
  }, []);

  // Update Stockfish onmessage handler
  useEffect(() => {
    if (!engineRef.current) return;

    engineRef.current.onmessage = (e) => {
      const line = e.data;
      
      if (line.includes("score cp") && gameStarted) {
        const parts = line.split(" ");
        const score = parseInt(parts[parts.indexOf("cp") + 1]);
        const sideMultiplier = chessGameRef.current.turn() === 'w' ? 1 : -1;
        setEvaluation(score * sideMultiplier);
        setIsMateEval(false);
      }
      else if (line.includes("score mate") && gameStarted) {
        const parts = line.split(" ");
        const mateIn = parseInt(parts[parts.indexOf("mate") + 1]);
        const sideMultiplier = chessGameRef.current.turn() === 'w' ? 1 : -1;
        const score = (mateIn > 0 ? 10000 - mateIn : -10000 - mateIn) * sideMultiplier;
        setEvaluation(score);
        setIsMateEval(true);
      }

      if (line.startsWith("bestmove")) {
        const moveStr = line.split(" ")[1];
        if (moveStr && moveStr !== "(none)") {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotion = moveStr.length === 5 ? moveStr[4] : "q";

          const currentTurn = chessGameRef.current.turn();
          const controller = currentTurn === 'w' ? whitePlayer : blackPlayer;

          if (gameStarted && !gameOver && controller === 'stockfish') {
            setIsStockfishThinking(false);
            makeBotMove(from, to, promotion);
          }
        }
      }
    };
  }, [whitePlayer, blackPlayer, gameStarted, gameOver]);

  // --- CORE TURN CONTROLLER (PvE, EvE, PvP) ---
  useEffect(() => {
    if (!gameStarted || gameOver) return;

    let isCancelled = false;
    const fen = chessGameRef.current.fen();
    const currentTurn = chessGameRef.current.turn();
    const controller = currentTurn === 'w' ? whitePlayer : blackPlayer;
    const activeLlmProvider = currentTurn === 'w' ? whiteLlm : blackLlm;

    // 1. STOCKFISH TURN
    if (controller === 'stockfish') {
      setIsStockfishThinking(true);
      const timer = setTimeout(() => {
        if (isCancelled || !engineRef.current) return;
        const skillLevel = Math.max(0, Math.floor(((botElo - 250) / 3000) * 20));
        engineRef.current.postMessage(`setoption name Skill Level value ${skillLevel}`);
        engineRef.current.postMessage(`position fen ${fen}`);
        engineRef.current.postMessage(`go movetime 700`);
      }, 500);
      return () => clearTimeout(timer);
    }

    if (engineRef.current) {
      engineRef.current.postMessage(`position fen ${fen}`);
      engineRef.current.postMessage("go depth 10");
    }

    // 2. LLM TURN
    if (controller === 'llm') {
      const legalVerbose = chessGameRef.current.moves({ verbose: true });
      const legalUciMoves = legalVerbose.map(m => `${m.from}${m.to}${m.promotion || ''}`);

      if (legalUciMoves.length === 0) return;

      // 1.2s delay keeps RPM under free-tier rate limits during fast games
      const timer = setTimeout(async () => {
        const chosenUci = await fetchLLMMove(fen, legalUciMoves, activeLlmProvider, apiKeys);
        if (isCancelled || !chosenUci) return;

        const from = chosenUci.substring(0, 2);
        const to = chosenUci.substring(2, 4);
        const promotion = chosenUci.length === 5 ? chosenUci[4] : "q";
        makeBotMove(from, to, promotion);
      }, 1200);

      return () => {
        isCancelled = true;
        clearTimeout(timer);
      };
    }
  }, [turn, gameStarted, gameOver, whitePlayer, blackPlayer, whiteLlm, blackLlm, botElo, apiKeys, fetchLLMMove]);

  // --- RENDER HELPERS ---
  
  const getWhiteBarHeight = () => {
    if (!gameStarted) return 50;
    const evalClamped = Math.max(-10000, Math.min(10000, evaluation));
    const winningChance = 1 / (1 + Math.exp(-0.004 * evalClamped));
    return Math.min(Math.max(winningChance * 100, 5), 95);
  };

  let displayBoard = board;
  let displayLastMove = lastMove;
  if (viewIndex !== -1 && fenHistory[viewIndex + 1]) {
    const tempGame = new Chess(fenHistory[viewIndex + 1]);
    displayBoard = tempGame.board();
    const histMove = history[viewIndex];
    displayLastMove = histMove ? { from: histMove.from, to: histMove.to } : null;
  }

  const rowIndices = orientation === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const colIndices = orientation === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];

  // Dynamic PlayerInfo generator using llmId for automatic logo resolution
  const renderPlayerCard = (sideColor) => {
    const type = sideColor === 'w' ? whitePlayer : blackPlayer;
    const llmId = sideColor === 'w' ? whiteLlm : blackLlm;
    const isTurn = gameStarted && !gameOver && turn === sideColor;

    if (type === 'llm') {
      const providerInfo = AI_PROVIDERS[llmId] || AI_PROVIDERS.gemini;
      return (
        <PlayerInfo
          name={providerInfo.name}
          level="AI"
          llmId={llmId}
          isThinking={isTurn && isLLMThinking}
        />
      );
    }
    if (type === 'stockfish') {
      return (
        <PlayerInfo
          name="Stockfish"
          level={botElo}
          llmId="stockfish"
          isThinking={isTurn && isStockfishThinking}
        />
      );
    }
    return (
      <PlayerInfo
        name={sideColor === 'w' ? "White Player" : "Black Player"}
        level={700}
      />
    );
  };

  const topPlayerInfo = orientation === 'w' ? renderPlayerCard('b') : renderPlayerCard('w');
  const bottomPlayerInfo = orientation === 'w' ? renderPlayerCard('w') : renderPlayerCard('b');

  // Logo-only selector row for choosing which AI provider to use
  const renderAILogoSelector = (selectedLlm, setSelectedLlm) => (
    <div className="flex items-center justify-between gap-2 mt-2 bg-[#161512]/60 p-1.5 rounded border border-white/5">
      {LLM_LIST.map((id) => {
        const provider = AI_PROVIDERS[id];
        const isSelected = selectedLlm === id;
        const hasKey = Boolean(apiKeys[id]?.trim()) || (id === "gemini" && Boolean(import.meta.env.VITE_GEMINI_API));

        return (
          <button
            key={id}
            type="button"
            title={provider.name}
            onClick={() => {
              setSelectedLlm(id);
              setActiveKeyModal(id);
            }}
            className={`relative w-9 h-9 rounded flex items-center justify-center p-1.5 transition-all ${
              isSelected
                ? "bg-white/15 ring-2 ring-[#81b64c] scale-105"
                : "bg-white/5 opacity-50 hover:opacity-100 hover:bg-white/10"
            }`}
          >
            <img
              src={provider.pic}
              alt={provider.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            {/* Small green dot if API key is configured */}
            {hasKey && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#81b64c] border border-[#161512]" />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="flex flex-col md:flex-row md:flex-wrap min-h-screen w-full bg-[#161512] p-0 md:p-4 gap-4 text-white justify-center items-center overflow-x-hidden overflow-y-auto font-sans"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Responsive Small-Screen Board Styles */}
      <style>
        {`
          @media (max-width: 767px) {
            .chess-board {
              width: 100%;
              aspect-ratio: 1 / 1;
            }
            .chess-board > .board-row {
              width: 100%;
              height: 12.5%;
            }
            .chess-board > .board-row > .board-cell {
              width: 12.5%;
              height: 100%;
            }
            .chess-board > .board-row > .board-cell > * {
              width: 100% !important;
              height: 100% !important;
            }
            .chess-board > .board-row > .board-cell img {
              max-width: 85%;
              max-height: 85%;
              object-fit: contain;
            }
          }
        `}
      </style>

      {/* POPUP MODAL FOR API KEY & OFFICIAL LINK */}
      {activeKeyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setActiveKeyModal(null)}
        >
          <div
            className="bg-[#262421] border border-white/10 rounded-lg p-5 w-full max-w-sm shadow-2xl flex flex-col gap-4 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <img
                  src={AI_PROVIDERS[activeKeyModal].pic}
                  alt={AI_PROVIDERS[activeKeyModal].name}
                  className="w-7 h-7 object-contain rounded"
                />
                <span className="font-bold text-sm">
                  {AI_PROVIDERS[activeKeyModal].name} API Key
                </span>
              </div>
              <button
                onClick={() => setActiveKeyModal(null)}
                className="text-gray-400 hover:text-white text-sm font-bold px-1"
              >
                ✕
              </button>
            </div>

            <input
              type="password"
              value={apiKeys[activeKeyModal] || ""}
              onChange={(e) => handleSaveApiKey(activeKeyModal, e.target.value)}
              placeholder={`Paste your ${AI_PROVIDERS[activeKeyModal].name} API key...`}
              className="w-full px-3 py-2 rounded bg-[#161512] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#81b64c]"
            />

            <a
              href={AI_PROVIDERS[activeKeyModal].keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#81b64c] hover:underline flex items-center justify-between bg-[#161512]/60 px-3 py-2 rounded border border-[#81b64c]/30"
            >
              <span>Get your {AI_PROVIDERS[activeKeyModal].name} API Key</span>
              <span>↗</span>
            </a>

            <button
              onClick={() => setActiveKeyModal(null)}
              className="w-full py-2 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded text-xs uppercase tracking-wider transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* CENTER: DESKTOP PLAYER INFO + BOARD + MOBILE ANNOTATIONS */}
      <div className="flex flex-col items-center justify-center w-full md:w-fit order-1 md:order-2">
        
        {/* Outer Row: Keeps Desktop Player Info permanently on the LEFT */}
        <div className="flex gap-2 md:gap-4 items-stretch md:items-center justify-center w-full md:w-fit p-2 md:p-0">
          
          {/* DESKTOP PLAYER INFO COLUMN */}
          <div className="hidden md:flex flex-col justify-between py-1 h-[560px] min-w-[170px] flex-shrink-0">
            <div>{topPlayerInfo}</div>
            <div>{bottomPlayerInfo}</div>
          </div>

          {/* Inner Row: Eval Bar + Board */}
          <div className={`flex gap-1.5 md:gap-1 items-stretch md:items-center justify-center w-full md:w-fit ${orientation === "b" ? "flex-row-reverse" : ""}`}>
            
            {/* EVALUATION BAR */}
            <div className="hidden w-5 md:w-8 self-stretch md:self-auto md:h-[560px] bg-[#161512] rounded relative overflow-hidden border border-white/5 flex-col shadow-inner flex-shrink-0">
              <div className="flex-grow bg-[#161512]"></div>
              <div
                className="bg-white transition-all duration-700 ease-out"
                style={{ height: `${getWhiteBarHeight()}%` }}
              ></div>
              {gameStarted && (
                <span className="absolute top-1/2 -translate-y-1/2 w-full text-center text-[10px] md:text-xs font-bold opacity-80 mix-blend-difference text-white select-none z-10">
                  {isMateEval
                    ? `M${Math.abs(10000 - Math.abs(evaluation))}`
                    : Math.abs(evaluation / 100).toFixed(1)}
                </span>
              )}
            </div>

            {/* BOARD & MOBILE PLAYER INFO WRAPPER */}
            <div className="flex-1 md:flex-none flex flex-col w-full md:w-fit">
              {/* MOBILE TOP PLAYER INFO */}
              <div className="md:hidden w-full mb-1">{topPlayerInfo}</div>

              <div
                className="chess-board relative shadow-2xl origin-center transition-all select-none w-full md:w-fit"
                onContextMenu={(e) => e.preventDefault()}
              >
                <ArrowOverlay arrows={arrows} orientation={orientation} />
                {rowIndices.map((rIdx) => (
                  <div key={rIdx} className="board-row flex">
                    {colIndices.map((cIdx) => {
                      const squareId = `${rIdx}-${cIdx}`;
                      const pieceData = displayBoard[rIdx][cIdx];
                      const moveData = possibleMoves?.find(
                        (m) => m.id === squareId,
                      );
                      const currentNotation = `${String.fromCharCode(97 + cIdx)}${8 - rIdx}`;
                      const isLastMove =
                        displayLastMove &&
                        (displayLastMove.from === currentNotation ||
                          displayLastMove.to === currentNotation);

                      return (
                        <div
                          key={squareId}
                          className="board-cell"
                          onMouseDown={(e) => handleRightClickDown(squareId, e)}
                          onMouseUp={(e) => handleRightClickUp(squareId, e)}
                        >
                          <Square
                            isLastMove={isLastMove}
                            squareId={squareId}
                            position={{ row: rIdx, col: cIdx }}
                            isWhite={(rIdx + cIdx) % 2 === 0}
                            piece={
                              pieceData
                                ? `${pieceData.color}${pieceData.type}`
                                : null
                            }
                            isCheck={checkSquare === squareId && viewIndex === -1}
                            moveType={
                              viewIndex === -1
                                ? moveData
                                  ? moveData.isCapture
                                    ? "capture"
                                    : "quiet"
                                  : null
                                : null
                            }
                            onSquareClick={onSquareClick}
                            onDragStart={handleDragStart}
                            onDrop={handleDrop}
                            clickedSquare={clickedSquare}
                            setClickedSquare={setClickedSquare}
                            hoveredSquare={hoveredSquare}
                            sethoveredSquare={sethoveredSquare}
                            orientation={orientation}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
                {pendingPromotion && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-[#2d313f] p-4 rounded-lg flex gap-4 border border-white/20">
                      {["q", "r", "b", "n"].map((t) => (
                        <button
                          key={t}
                          onClick={() => handlePromotion(t)}
                          className="hover:bg-white/10 p-2 rounded"
                        >
                          <img
                            src={`/chess_pieces/${turn}${t}.png`}
                            className="w-14 h-14"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* MOBILE BOTTOM PLAYER INFO */}
              <div className="md:hidden w-full mt-1">{bottomPlayerInfo}</div>
            </div>
          </div>
        </div>

        {/* MOBILE HORIZONTAL ANNOTATIONS */}
        <div className="flex md:hidden w-[calc(100%-1rem)] mx-8 bg-[#262421] border border-white/5 rounded px-3 py-2.5 items-center gap-2 shadow-lg mt-2">
          <button
            onClick={goBack}
            className="bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[10px] border border-white/10 text-white flex-shrink-0"
          >
            <img src={left} className="w-3" />
          </button>
          <div
            ref={mobileHistoryScrollRef}
            className="flex items-center gap-2 overflow-x-auto whitespace-nowrap flex-grow text-xs text-gray-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-0.5"
          >
            {history.length === 0 ? (
              <span className="text-gray-500 text-[11px] italic">
                Moves will appear here...
              </span>
            ) : (
              Array.from({ length: Math.ceil(history.length / 2) }).map(
                (_, i) => {
                  const whiteIdx = i * 2;
                  const blackIdx = i * 2 + 1;
                  const isWhiteActive = currentMoveIndex === whiteIdx;
                  const isBlackActive = currentMoveIndex === blackIdx;

                  return (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1 flex-shrink-0"
                    >
                      <span className="text-gray-500 font-mono text-[10px]">
                        {i + 1}.
                      </span>
                      <span
                        onClick={() => {
                          playSound("move");
                          setViewIndex(
                            whiteIdx === history.length - 1 ? -1 : whiteIdx,
                          );
                        }}
                        className={`px-1.5 py-0.5 font-medium cursor-pointer rounded transition-colors ${
                          isWhiteActive
                            ? "bg-[#81b64c]/30 text-[#81b64c] border border-[#81b64c]/50 font-bold"
                            : "hover:bg-white/10"
                        }`}
                      >
                        {history[whiteIdx]?.san || ""}
                      </span>
                      {history[blackIdx] && (
                        <span
                          onClick={() => {
                            playSound("move");
                            setViewIndex(
                              blackIdx === history.length - 1 ? -1 : blackIdx,
                            );
                          }}
                          className={`px-1.5 py-0.5 font-medium cursor-pointer rounded transition-colors ${
                            isBlackActive
                              ? "bg-[#81b64c]/30 text-[#81b64c] border border-[#81b64c]/50 font-bold"
                              : "hover:bg-white/10"
                          }`}
                        >
                          {history[blackIdx]?.san || ""}
                        </span>
                      )}
                    </div>
                  );
                },
              )
            )}
          </div>
          <button
            onClick={goForward}
            className="bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[10px] border border-white/10 text-white flex-shrink-0"
          >
            <img src={right} className="w-3" />
          </button>
        </div>
      </div>

      {/* RIGHT: INFO & MODE CONTROLS */}
      <div className="flex flex-col w-[calc(100%-1rem)] mx-8 md:mx-0 md:w-[320px] h-auto md:h-[560px] bg-[#262421] rounded shadow-lg overflow-hidden border border-white/5 order-2 md:order-3">
        <div className="p-3 bg-[#21201d] text-center font-bold text-xs uppercase text-gray-400 border-b border-white/5 flex justify-between items-center px-4">
          <span>Game Arena</span>
          <div className="flex gap-1">
            <button
              onClick={goBack}
              className="bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[9px] border border-white/10 text-white"
            >
              <img src={left} className="w-3" />
            </button>
            <button
              onClick={goForward}
              className="bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[9px] border border-white/10 text-white"
            >
              <img src={right} className="w-3" />
            </button>
            <button
              onClick={() =>
                setOrientation((prev) => (prev === "w" ? "b" : "w"))
              }
              className="bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-[9px] border border-white/10 ml-2"
            >
              Rotate
            </button>
          </div>
        </div>

        {/* SETUP PANEL */}
        {!gameStarted && (
          <div className="p-4 bg-[#2d313f]/50 border-b border-white/5 flex flex-col gap-3 animate-in slide-in-from-right">
            
            {/* WHITE CONTROLLER */}
            <div>
              <p className="text-[10px] uppercase text-gray-400 font-bold mb-1.5">
                White Player
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "human", label: "Player" },
                  { id: "llm", label: "LLM" },
                  { id: "stockfish", label: "Stockfish" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setWhitePlayer(opt.id)}
                    className={`py-1.5 rounded text-[11px] font-bold transition-all ${
                      whitePlayer === opt.id
                        ? "bg-white text-black shadow"
                        : "bg-white/10 text-gray-400 hover:bg-white/15"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* LOGO-ONLY AI SELECTOR FOR WHITE */}
              {whitePlayer === "llm" && renderAILogoSelector(whiteLlm, setWhiteLlm)}
            </div>

            {/* BLACK CONTROLLER */}
            <div>
              <p className="text-[10px] uppercase text-gray-400 font-bold mb-1.5">
                Black Player
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "human", label: "Player" },
                  { id: "llm", label: "LLM" },
                  { id: "stockfish", label: "Stockfish" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setBlackPlayer(opt.id)}
                    className={`py-1.5 rounded text-[11px] font-bold transition-all ${
                      blackPlayer === opt.id
                        ? "bg-white text-black shadow"
                        : "bg-white/10 text-gray-400 hover:bg-white/15"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* LOGO-ONLY AI SELECTOR FOR BLACK */}
              {blackPlayer === "llm" && renderAILogoSelector(blackLlm, setBlackLlm)}
            </div>

            <button
              onClick={startGame}
              className="w-full py-2.5 mt-1 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded shadow-lg text-xs uppercase tracking-wider transition-all"
            >
              Start Match
            </button>
          </div>
        )}

        {/* IN-GAME CONTROLS */}
        {gameStarted && !gameOver && (
          <div className="px-4 py-2 bg-[#21201d] border-b border-white/5 flex justify-between items-center">
            <span className="text-[11px] text-gray-400 font-medium">
              Turn: <strong className="text-white">{turn === "w" ? "White" : "Black"}</strong>
            </span>
            <button
              onClick={resetGame}
              className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded text-[10px] font-bold uppercase transition-all"
            >
              Stop / Reset
            </button>
          </div>
        )}

        {/* LLM ERROR BANNER */}
        {llmError && (
          <div className="px-3 py-1.5 bg-amber-500/20 border-b border-amber-500/30 text-amber-300 text-[11px] text-center">
            {llmError}
          </div>
        )}

        {/* STOCKFISH ELO SLIDER */}
        <div
          className={`p-4 bg-[#21201d]/50 border-b border-white/5 ${isGameInProgress ? "opacity-50 grayscale" : ""}`}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">
              Stockfish Bot Elo
            </span>
            <span className="text-xs text-[#81b64c] font-mono">{botElo}</span>
          </div>
          <input
            type="range"
            min="250"
            max="3200"
            step="250"
            value={botElo}
            disabled={isGameInProgress}
            onChange={(e) => setBotElo(Number(e.target.value))}
            className="w-full h-1 bg-[#403d39] rounded appearance-none cursor-pointer accent-[#81b64c]"
          />
        </div>

        {/* DESKTOP VERTICAL ANNOTATIONS */}
        <div
          ref={historyScrollRef}
          className="hidden md:block p-4 flex-grow overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-[#161512]/30 text-xs text-gray-200"
        >
          <div className="grid grid-cols-3 gap-y-1">
            {Array.from({ length: Math.ceil(history.length / 2) }).map(
              (_, i) => {
                const whiteIdx = i * 2;
                const blackIdx = i * 2 + 1;
                const isWhiteActive = currentMoveIndex === whiteIdx;
                const isBlackActive = currentMoveIndex === blackIdx;

                return (
                  <div key={i} className="contents">
                    <div className="py-1 px-2 text-gray-500 font-mono text-[10px]">
                      {i + 1}.
                    </div>
                    <div
                      onClick={() => {
                        playSound("move");
                        setViewIndex(
                          whiteIdx === history.length - 1 ? -1 : whiteIdx,
                        );
                      }}
                      className={`py-1 px-2 font-medium cursor-pointer hover:bg-white/10 rounded ${
                        isWhiteActive
                          ? "bg-[#81b64c]/30 text-[#81b64c] border border-[#81b64c]/50 font-bold"
                          : ""
                      }`}
                    >
                      {history[whiteIdx]?.san || ""}
                    </div>
                    <div
                      onClick={() => {
                        if (history[blackIdx]) {
                          playSound("move");
                          setViewIndex(
                            blackIdx === history.length - 1 ? -1 : blackIdx,
                          );
                        }
                      }}
                      className={`py-1 px-2 font-medium cursor-pointer hover:bg-white/10 rounded ${
                        isBlackActive
                          ? "bg-[#81b64c]/30 text-[#81b64c] border border-[#81b64c]/50 font-bold"
                          : ""
                      }`}
                    >
                      {history[blackIdx]?.san || ""}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>

        {gameOver && (
          <div className="p-4 border-t border-white/5 bg-[#161512]">
            <p className="text-xs font-bold text-red-400 mb-2 text-center uppercase">
              {gameOver}
            </p>
            <button
              onClick={resetGame}
              className="w-full py-2 bg-white text-black font-bold rounded text-xs"
            >
              New Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}