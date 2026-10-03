import type { Review } from '@/lib/verifyCalls'

/** The call the team key is about to sign, decoded in this browser, before it signs. */
export function CallReview({ review }: { review: Review }) {
  return (
    <div className="border border-hairline bg-surface-1 p-4" aria-label="What you are signing">
      <p className="text-body-sm font-semibold">{review.title}</p>
      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-4 gap-y-1 text-caption">
        {review.lines.map(([label, value], i) => (
          <div key={`${label}-${i}`} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="num break-all text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
