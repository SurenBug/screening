import type { ChangeEvent, ReactNode } from 'react'
import { useApp } from '../store'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/labels'

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>
        {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Text({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  required,
  placeholder,
  disabled,
}: {
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  type?: string
  hint?: string
  required?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function Area({
  label,
  value,
  onChange,
  hint,
  rows,
}: {
  label: string
  value: string | null | undefined
  onChange: (v: string) => void
  hint?: string
  rows?: number
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
  required,
  empty = '— не выбрано —',
  disabled,
}: {
  label: string
  value: string | null | undefined
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  hint?: string
  required?: boolean
  empty?: string | null
  disabled?: boolean
}) {
  return (
    <Field label={label} hint={hint} required={required}>
      <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {empty !== null && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Выпадающий список, заполняемый из справочника — админ добавляет значения без программиста. */
export function DictSelect({
  label,
  type,
  value,
  onChange,
  hint,
  required,
  disabled,
}: {
  label: string
  type: string
  value: string | null | undefined
  onChange: (v: string) => void
  hint?: string
  required?: boolean
  disabled?: boolean
}) {
  const { list } = useApp()
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      required={required}
      disabled={disabled}
      options={list(type).map((d) => ({ value: d.code, label: d.label }))}
    />
  )
}

export function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <div className="hint">{hint}</div>}
      </span>
    </label>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_COLORS[status] ?? ''}`}>{STATUS_LABELS[status] ?? status}</span>
}

export function Loader({ text = 'Загрузка…' }: { text?: string }) {
  return <div className="spinner">{text}</div>
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="alert-box error">{error}</div>
}

export function Warnings({ items }: { items?: string[] }) {
  if (!items?.length) return null
  return (
    <div className="alert-box warn">
      <div>
        <b>Проверьте:</b>
        <ul>
          {items.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  if (!title) return <div className="card">{children}</div>
  return (
    <div className="card tight">
      <div className="card-head">
        <h2>{title}</h2>
        <div style={{ flex: 1 }} />
        {actions}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
