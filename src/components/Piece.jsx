const Piece = ({ type, color, row, col }) => {
  const pieceCode = `${color}${type}`;
  
  // Slide animation logic
  const style = {
    position: 'absolute',
    width: '70px',
    height: '70px',
    transform: `translate(${col * 70}px, ${row * 70}px)`,
    transition: 'transform 300ms ease-in-out', // The "Magic" line
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none', // Allow clicks to pass through to the Square
    zIndex: 100,
  };

  return (
    <div style={style}>
      <img 
        src={`/chess_pieces/${pieceCode}.png`} 
        alt={pieceCode} 
        style={{ width: '85%' }} 
      />
    </div>
  );
};

export default Piece