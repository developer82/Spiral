import './StatBox.css'

interface StatBoxProps {
  title: string
  value: number
  mainColor: string
  backgroundColor?: string | null
}

function StatBox({ title, value, mainColor, backgroundColor = null }: StatBoxProps): React.JSX.Element {
  return (
    <div
      className="stat-box"
      style={
        {
          '--stat-box-main-color': mainColor,
          '--stat-box-bg-color': backgroundColor ?? 'transparent'
        } as React.CSSProperties
      }
    >
      <span className="stat-box__title">{title}</span>
      <strong className="stat-box__value">{value}</strong>
      <div className="stat-box__strip" />
    </div>
  )
}

export default StatBox
