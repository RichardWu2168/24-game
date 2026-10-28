interface Props {
  cards: number[]
  onCardClick: (number: number) => void
}

export function PuzzleCards({ cards, onCardClick }: Props) {
  const suits = ['♠', '♥', '♦', '♣']
  return <section className="cards-container" aria-label="Your four cards">
    {cards.map((number, index) => {
      const suit = suits[index % suits.length]
      const isRed = suit === '♥' || suit === '♦'
      return <div className="playing-card" key={index} onClick={() => onCardClick(number)}>
        <span className="card-corner">{number}</span>
        <span className="card-number">{number}</span>
        <span className={`card-suit ${isRed ? 'red-suit' : ''}`}>{suit}</span>
      </div>
    })}
  </section>
}
