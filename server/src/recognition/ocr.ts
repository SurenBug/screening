import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createWorker, type Worker } from 'tesseract.js'

const here = path.dirname(fileURLToPath(import.meta.url))
/** Языковые модели лежат рядом с проектом: наружу за ними ходить нельзя. */
const LANG_PATH = process.env.OCR_DATA_DIR ?? path.resolve(here, '../../ocr-data')

export type Lang = 'rus' | 'eng'

/**
 * Воркеры дорого создавать (около секунды), поэтому держим по одному на язык
 * и выстраиваем запросы в очередь: воркер Tesseract умеет только одну задачу за раз.
 */
const workers = new Map<Lang, Promise<Worker>>()
const queues = new Map<Lang, Promise<unknown>>()

async function getWorker(lang: Lang): Promise<Worker> {
  let w = workers.get(lang)
  if (!w) {
    w = createWorker(lang, 1, {
      langPath: LANG_PATH,
      gzip: false,
      cacheMethod: 'none',
      logger: () => {},
    })
    workers.set(lang, w)
  }
  return w
}

function enqueue<T>(lang: Lang, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(lang) ?? Promise.resolve()
  const next = prev.then(job, job)
  queues.set(
    lang,
    next.catch(() => {}),
  )
  return next
}

export async function shutdownOcr() {
  for (const [, w] of workers) {
    const worker = await w
    await worker.terminate().catch(() => {})
  }
  workers.clear()
}

/**
 * Подготовка снимка с телефона. Фотографии бумаги почти всегда сероватые
 * и с неровным освещением — выравнивание контраста даёт заметно больше,
 * чем любые ухищрения в самом распознавании.
 */
export async function preprocess(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // по данным EXIF: снятое боком фото иначе не распознаётся вовсе
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalise()
    .sharpen()
    .png()
    .toBuffer()
}

export interface OcrPass {
  text: string
  confidence: number
}

export async function recognize(image: Buffer, lang: Lang): Promise<OcrPass> {
  return enqueue(lang, async () => {
    const worker = await getWorker(lang)
    const { data } = await worker.recognize(image)
    return { text: data.text ?? '', confidence: Math.round(data.confidence ?? 0) }
  })
}

/**
 * Русская модель уверенно подменяет латиницу кириллицей: кариотип 47,XY,+21
 * распознаётся как «47,Х\У,+21», а окраска GTG — как «СТС». Поэтому снимок
 * прогоняется дважды, и латинские по своей природе значения (кариотип, коды,
 * названия методов) берутся из английского прохода.
 */
export interface OcrResult {
  text: string
  latinText: string
  confidence: number
}

export async function recognizeBoth(input: Buffer): Promise<OcrResult> {
  const image = await preprocess(input)
  const [rus, eng] = await Promise.all([recognize(image, 'rus'), recognize(image, 'eng')])
  return {
    text: rus.text,
    latinText: eng.text,
    confidence: Math.max(rus.confidence, 0),
  }
}
