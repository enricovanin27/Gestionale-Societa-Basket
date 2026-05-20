import { useState } from 'react'

export default function PrepSesioneInlineForm({ onChange }) {
  const [quando, setQuando] = useState('prima')
  const [durata, setDurata] = useState('30')
  const [suCampo, setSuCampo] = useState(false)

  function update(nextWhen, nextDur, nextCampo) {
    onChange({ quando: nextWhen, durata_min: parseInt(nextDur) || 30, su_campo: nextCampo })
  }

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
      <div className="text-xs font-semibold text-amber-800">Dettagli parte atletica</div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Quando</div>
        <div className="flex gap-2">
          {['prima', 'durante', 'dopo'].map(q => (
            <button key={q} type="button"
              onClick={() => { setQuando(q); update(q, durata, suCampo) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                quando === q ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'
              }`}>
              {q.charAt(0).toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Durata (minuti)</div>
        <input type="number" min="5"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={durata}
          onChange={e => { setDurata(e.target.value); update(quando, e.target.value, suCampo) }} />
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1">Dove</div>
        <div className="flex gap-2">
          {[['false', 'Fuori campo'], ['true', '⚠ Su campo']].map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => { const b = val === 'true'; setSuCampo(b); update(quando, durata, b) }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                String(suCampo) === val
                  ? val === 'true' ? 'bg-red-500 text-white border-red-500' : 'bg-green-500 text-white border-green-500'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}>{label}</button>
          ))}
        </div>
        {suCampo && <p className="text-xs text-red-600 mt-1">Occupa spazio in palestra — visibile nel calendario admin.</p>}
      </div>
    </div>
  )
}
