import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Area, Check, ErrorBox, Loader, Select, Text } from '../components/ui'
import PhotoRecognizer, { applyRecognized } from '../components/PhotoRecognizer'
import { int, toInputDate } from '../lib/format'
import type { Patient } from '../types'

const OCR_KEYS = [
  'lastName',
  'firstName',
  'middleName',
  'birthDate',
  'phone',
  'cardNumber',
  'referringInstitution',
  'bloodGroup',
  'rhesus',
] as const

const empty = {
  lastName: '',
  firstName: '',
  middleName: '',
  birthDate: '',
  phone: '',
  cardNumber: '',
  bloodGroup: '',
  rhesus: '',
  address: '',
  referringInstitution: '',
  snils: '',
  policy: '',
  gravida: '',
  para: '',
  abortions: '',
  miscarriages: '',
  stillbirths: '',
  ivf: false,
  consanguinity: false,
  familyHistory: '',
  obstetricHistory: '',
  geneticHistory: '',
  teratogens: '',
  chronicDiseases: '',
  notes: '',
}

export default function PatientFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ ...empty })
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api.get<Patient>(`/patients/${id}`).then((p) => {
      setForm({
        ...empty,
        ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])),
        birthDate: toInputDate(p.birthDate),
        ivf: !!p.ivf,
        consanguinity: !!p.consanguinity,
      } as any)
      setLoading(false)
    })
  }, [id])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const payload = {
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName || null,
      birthDate: form.birthDate || null,
      phone: form.phone || null,
      cardNumber: form.cardNumber || null,
      bloodGroup: form.bloodGroup || null,
      rhesus: form.rhesus || null,
      address: form.address || null,
      referringInstitution: form.referringInstitution || null,
      snils: form.snils || null,
      policy: form.policy || null,
      gravida: int(form.gravida),
      para: int(form.para),
      abortions: int(form.abortions),
      miscarriages: int(form.miscarriages),
      stillbirths: int(form.stillbirths),
      ivf: form.ivf,
      consanguinity: form.consanguinity,
      familyHistory: form.familyHistory || null,
      obstetricHistory: form.obstetricHistory || null,
      geneticHistory: form.geneticHistory || null,
      teratogens: form.teratogens || null,
      chronicDiseases: form.chronicDiseases || null,
      notes: form.notes || null,
    }
    try {
      const saved = id
        ? await api.patch<Patient>(`/patients/${id}`, payload)
        : await api.post<Patient>('/patients', payload)
      navigate(`/patients/${saved.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loader />

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head">
        <div>
          <h1>{id ? 'Изменение данных пациентки' : 'Новая пациентка'}</h1>
          <div className="page-sub">Код присваивается автоматически при сохранении</div>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <PhotoRecognizer
            expect="REFERRAL"
            buttonLabel="📷 Заполнить с направления"
            onApply={(v) => setForm((f) => applyRecognized(f, v, OCR_KEYS))}
          />
        </div>

        <ErrorBox error={error} />

        <fieldset>
          <legend>Паспортные данные</legend>
          <div className="grid cols-3">
            <Text label="Фамилия" required value={form.lastName} onChange={(v) => set('lastName', v)} />
            <Text label="Имя" required value={form.firstName} onChange={(v) => set('firstName', v)} />
            <Text label="Отчество" value={form.middleName} onChange={(v) => set('middleName', v)} />
          </div>
          <div className="grid cols-4">
            <Text label="Дата рождения" required type="date" value={form.birthDate} onChange={(v) => set('birthDate', v)} />
            <Text label="Телефон" type="tel" value={form.phone} onChange={(v) => set('phone', v)} />
            <Text label="Номер карты" value={form.cardNumber} onChange={(v) => set('cardNumber', v)} />
            <Text label="Направившее учреждение" value={form.referringInstitution} onChange={(v) => set('referringInstitution', v)} />
          </div>
          <div className="grid cols-4">
            <Select
              label="Группа крови"
              value={form.bloodGroup}
              onChange={(v) => set('bloodGroup', v)}
              options={['O(I)', 'A(II)', 'B(III)', 'AB(IV)'].map((v) => ({ value: v, label: v }))}
            />
            <Select
              label="Резус-фактор"
              value={form.rhesus}
              onChange={(v) => set('rhesus', v)}
              hint={form.rhesus === 'NEG' ? 'Потребуется анти-D иммуноглобулин' : undefined}
              options={[
                { value: 'POS', label: 'Положительный' },
                { value: 'NEG', label: 'Отрицательный' },
              ]}
            />
            <Text label="СНИЛС" value={form.snils} onChange={(v) => set('snils', v)} />
            <Text label="Полис ОМС" value={form.policy} onChange={(v) => set('policy', v)} />
          </div>
          <Text label="Адрес" value={form.address} onChange={(v) => set('address', v)} />
        </fieldset>

        <fieldset>
          <legend>Акушерский анамнез</legend>
          <div className="grid cols-4">
            <Text label="Беременностей всего" type="number" value={form.gravida} onChange={(v) => set('gravida', v)} />
            <Text label="Родов" type="number" value={form.para} onChange={(v) => set('para', v)} />
            <Text label="Выкидышей" type="number" value={form.miscarriages} onChange={(v) => set('miscarriages', v)} />
            <Text label="Прерываний" type="number" value={form.abortions} onChange={(v) => set('abortions', v)} />
          </div>
          <div className="grid cols-2">
            <Text label="Мертворождений" type="number" value={form.stillbirths} onChange={(v) => set('stillbirths', v)} />
            <div style={{ paddingTop: 22 }}>
              <Check label="Беременность после ЭКО" checked={form.ivf} onChange={(v) => set('ivf', v)} />
              <Check label="Кровное родство супругов" checked={form.consanguinity} onChange={(v) => set('consanguinity', v)} />
            </div>
          </div>
          <Area label="Отягощённый акушерский анамнез" value={form.obstetricHistory} onChange={(v) => set('obstetricHistory', v)} />
        </fieldset>

        <fieldset>
          <legend>Генетический и общий анамнез</legend>
          <div className="grid cols-2">
            <Area
              label="Генетический анамнез"
              hint="Хромосомная патология у предыдущих детей, носительство перестроек у родителей"
              value={form.geneticHistory}
              onChange={(v) => set('geneticHistory', v)}
            />
            <Area
              label="Наследственные заболевания в семье"
              value={form.familyHistory}
              onChange={(v) => set('familyHistory', v)}
            />
            <Area label="Хронические заболевания" value={form.chronicDiseases} onChange={(v) => set('chronicDiseases', v)} />
            <Area label="Приём тератогенных препаратов, вредности" value={form.teratogens} onChange={(v) => set('teratogens', v)} />
          </div>
          <Area label="Примечания" value={form.notes} onChange={(v) => set('notes', v)} />
        </fieldset>

        <div className="btn-row">
          <button className="primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}
