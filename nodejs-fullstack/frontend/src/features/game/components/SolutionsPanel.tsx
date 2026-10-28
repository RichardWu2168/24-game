export function SolutionsPanel({ solutions }: { solutions: string[] }) {
  if (solutions.length === 0) return null
  return <section className="solutions-panel" aria-label="Game solutions">
    <h2>Solutions</h2>
    <ol className="solutions-list">
      {solutions.map(solution => <li key={solution}><code>{solution.slice(1, -1)} = 24</code></li>)}
    </ol>
  </section>
}
