import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard } from '../auth.js'
import { audit } from '../audit.js'
import { OcrTimeoutError, recognizeBoth } from '../recognition/ocr.js'
import { DOC_TYPE_LABELS, detectDocType, parseFields, type DocType } from '../recognition/parsers.js'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'
const MAX_FILES = 5
const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']

const DOC_KIND: Record<DocType, string> = {
  LAB_REPORT: 'LAB_REPORT',
  REFERRAL: 'REFERRAL',
  ULTRASOUND: 'ULTRASOUND',
  NIPT: 'LAB_REPORT',
  UNKNOWN: 'OTHER',
}

export default async function recognitionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  /**
   * Распознавание фотографий бумажных документов.
   * Всё считается на этом сервере: снимок с персональными данными наружу не уходит.
   */
  app.post('/', async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'Ожидается загрузка файлов' })
    }

    const started = Date.now()
    const images: { buffer: Buffer; filename: string; mimetype: string }[] = []
    let hint: DocType | undefined

    for await (const part of req.parts()) {
      if (part.type === 'field' && part.fieldname === 'hint') {
        hint = String(part.value) as DocType
        continue
      }
      if (part.type !== 'file') continue
      if (images.length >= MAX_FILES) {
        return reply.code(400).send({ error: `За один раз можно распознать не больше ${MAX_FILES} снимков` })
      }
      if (!ALLOWED.includes(part.mimetype)) {
        return reply.code(400).send({ error: 'Поддерживаются только изображения (JPEG, PNG, HEIC, WebP)' })
      }
      images.push({ buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype })
    }

    if (!images.length) return reply.code(400).send({ error: 'Не выбрано ни одного снимка' })

    // Несколько страниц одного документа склеиваем в один текст
    const passes = []
    for (const img of images) {
      try {
        passes.push(await recognizeBoth(img.buffer))
      } catch (err) {
        req.log.error({ err }, 'ошибка распознавания')
        if (err instanceof OcrTimeoutError) {
          return reply.code(503).send({
            error:
              'Распознавание не успело отработать. На демонстрационной площадке первый запуск после простоя ' +
              'бывает слишком долгим — повторите попытку. Если повторяется, заполните поля вручную.',
          })
        }
        return reply.code(500).send({ error: 'Не удалось распознать снимок. Попробуйте переснять при лучшем освещении.' })
      }
    }

    const text = passes.map((p) => p.text).join('\n')
    const latinText = passes.map((p) => p.latinText).join('\n')
    const confidence = Math.round(passes.reduce((a, p) => a + p.confidence, 0) / passes.length)

    const detected = detectDocType(text)
    // Подсказка врача из формы весомее автоопределения: он точно знает, что снял
    const docType: DocType = detected.type !== 'UNKNOWN' ? detected.type : (hint ?? 'UNKNOWN')
    const fields = parseFields(docType, { text, latinText, confidence })

    // Снимок сохраняем: он служит первоисточником, если к записи возникнут вопросы
    const attachmentIds: string[] = []
    await mkdir(UPLOAD_DIR, { recursive: true })
    for (const img of images) {
      const storedName = `${randomUUID()}${path.extname(img.filename) || '.jpg'}`
      await writeFile(path.join(UPLOAD_DIR, storedName), img.buffer)
      const att = await prisma.attachment.create({
        data: {
          filename: img.filename,
          storedName,
          mimeType: img.mimetype,
          size: img.buffer.length,
          kind: DOC_KIND[docType],
          uploadedById: req.user!.id,
        },
      })
      attachmentIds.push(att.id)
    }

    await audit(req, 'CREATE', 'Attachment', attachmentIds[0], `распознано: ${DOC_TYPE_LABELS[docType]}`)

    return {
      docType,
      docTypeLabel: DOC_TYPE_LABELS[docType],
      confidence,
      durationMs: Date.now() - started,
      rawText: text,
      attachmentIds,
      fields,
    }
  })

  /** Привязка сохранённых снимков к записи — вызывается после сохранения формы. */
  app.post('/link', async (req) => {
    const body = z
      .object({
        ids: z.array(z.string()).min(1),
        patientId: z.string().nullish(),
        procedureId: z.string().nullish(),
        resultId: z.string().nullish(),
      })
      .parse(req.body)

    await prisma.attachment.updateMany({
      where: { id: { in: body.ids }, uploadedById: req.user!.id },
      data: {
        patientId: body.patientId ?? undefined,
        procedureId: body.procedureId ?? undefined,
        resultId: body.resultId ?? undefined,
      },
    })
    return { ok: true }
  })
}
