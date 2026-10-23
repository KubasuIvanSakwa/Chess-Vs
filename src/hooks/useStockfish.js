import { useEffect, useState, useRef, useCallback } from "react";

export function useStockfish() {
  const [bestMove, setBestMove] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const engine = useRef(null);

  useEffect(() => {
    // Initialize the worker from the public folder
    engine.current = new Worker("/stockfish.js");

    // Listen for messages from Stockfish
    engine.current.onmessage = (event) => {
      const message = event.data;
      
      // 1. Extract Best Move
      if (message.startsWith("bestmove")) {
        const move = message.split(" ")[1];
        setBestMove(move);
      }
      
      // 2. Extract Evaluation (cp = centipawns)
      // "info depth 10 ... score cp 150" means +1.50 advantage
      if (message.includes("score cp")) {
        const scoreMatch = message.match(/score cp (-?\d+)/);
        if (scoreMatch) {
            setEvaluation(parseInt(scoreMatch[1]) / 100); 
        }
      }
      // Handle Mate scores "score mate 5"
      if (message.includes("score mate")) {
         const mateMatch = message.match(/score mate (-?\d+)/);
         if(mateMatch) {
             setEvaluation(`Mate in ${mateMatch[1]}`);
         }
      }
    };

    // Initialize engine with UCI protocol
    engine.current.postMessage("uci");
    engine.current.postMessage("isready");

    return () => {
      engine.current.terminate();
    };
  }, []);

  const analyzePosition = useCallback((fen, depth = 12) => {
    if (engine.current) {
      engine.current.postMessage(`position fen ${fen}`);
      engine.current.postMessage(`go depth ${depth}`);
    }
  }, []);

  return { bestMove, evaluation, analyzePosition };
}