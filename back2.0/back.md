1) Цель

Единый конвейер: получить чек из Телеграма → извлечь структурированные поля (сумма, валюта, тип операции, карта, оператор/продавец, время, баланс‑после, мерчант и пр.) → нормализовать → дедуплицировать → положить в БД и отдать в UI. Ядро извлечения — агент на OpenAI с Structured Outputs и функциями‑тулзами. Для потока изображений — OCR/vision через модель с поддержкой картинок. Ставка на Responses API (упрощённая модель работы, миграция с Assistants официально поощряется). 
platform.openai.com

2) Архитектура (обзор)
[Telegram] -> Ingest Gateway (Webhook) -> Event Bus (NATS/Kafka)
             \-> (опционально) User Client (TDLib/Telethon)

Event Bus -> Parser Agent Service (OpenAI Responses + Tools)
           -> Normalizer (оператор/продавец, валюта, дата/время)
           -> Deduper (LSH/sha1 сигнатуры)
           -> Storage: Postgres (OLTP) + Object Store (изображения)
           -> API (REST/GraphQL) -> Web UI (таблица, фильтры, экспорт)


Ключевые элементы:

Ingest Gateway — валидирует вебхуки Телеграма, распаковывает message/update/channel_post, складывает сырые «события» в шину.

User Client (опционально) — «пользовательский клиент» на TDLib/Telethon для чтения личных диалогов пользователя с банковскими ботами (см. §3.1 про риски).

Parser Agent Service — обращается к OpenAI Responses API (модели gpt‑5‑pro для сложных кейсов; экономичные gpt‑4o‑mini/gpt‑4.1‑nano — для быстрых классификаций). Строгая JSON‑схема через Structured Outputs. 
platform.openai.com
+4
platform.openai.com
+4
platform.openai.com
+4

Normalizer — стабилизирует числа, валюты, карты, маппит «операторов» на канонические имена и приложения по словарю. Источник словаря: ваш файл.

Deduper — предотвращает повторную запись одного и того же чека.

Storage — Postgres (OLTP), объекты (изображения/медиа) в S3/MinIO; для LLM‑контекста можно прикладывать файлы через OpenAI Files при отдельных задачах разбора PDF/изображений. Для PDF/картинок доступны мульти‑модальные входы. 
platform.openai.com
+1

3) Telegram: источники событий

3.1. Вариант A (рекомендованный, без «self‑bot»):
Пользователь и/или три «информирующих бота» публикуют в приватный канал. Наш бот‑коллектор (наш сервисный бот) добавляется админом и получает channel_post‑события по Bot API. Это ТOS‑совместимо; в бэкенде мы принимаем апдейты по вебхуку и отправляем их в шину.

3.2. Вариант B (опционально, под ответственность заказчика): «user client»
Запуск клиентской сессии пользователя через TDLib/Telethon (user account) для авто‑пересылки сообщений из приватных диалогов с банковскими ботами в канал/вебхук. Этот путь может попадать в «серыe зоны» правил Telegram. Делаем фичу модульной и отключаемой флагом ENV, явно обозначаем риски в договоре.

4) Схемы данных
4.1. Таблицы (Postgres)

receipts
id bigserial PK
user_id uuid
source_platform text (telegram)
source_chat_id text
message_id text
raw_text text
raw_html text NULL
raw_lang text (ru/uz/en)
event_type text (payment|purchase|p2p|topup|conversion|fee|penalty|other)
amount numeric(18,2)
currency char(3) (UZS|USD|...)
sign smallint (+1 topup, −1 списание)
card_brand text (HUMO|UZCARD|VISA|...)
card_mask text (***6714)
operator_raw text (например: "OQ P2P>TASHKENT")
operator_id int NULL (FK -> operators.id)
operator_canonical text
merchant_name text NULL
merchant_address text NULL
balance_after numeric(18,2) NULL
balance_currency char(3) NULL
ts_event timestamptz (UTC)
ts_local text (строка как в смске)
confidence real
duplicate_key text (hash для дедуп)
ingest_at timestamptz default now()
parse_status text (ok|needs_review|failed)
error text NULL

operators
id serial PK
pattern text (регэксп/like)
canonical text (напр. "OQ")
app text (напр. "OQ" / "MyUztelecom" / "Humans" и т. п.)
weight int default 1
notes text NULL

attachments
id bigserial PK
receipt_id bigint FK
type text (photo|pdf|video|voice|file)
file_bucket text
file_key text
sha256 text
ocr_text text NULL

cards
id serial PK
user_id uuid
mask text
brand text
issuer text NULL

Индексы: (user_id, ts_event desc), duplicate_key unique nulls not distinct, GIN по raw_text (full‑text).

4.2. События (в шине)

telegram.message.raw: сырые апдейты Bot API, payload: {update_id, message || channel_post, ...}

receipt.candidate: {source, raw_text, media_refs[], user_id?, received_at}

receipt.parsed: нормализованный JSON по схеме (ниже)

receipt.persisted: {receipt_id, status}

4.3. Схема нормализованного чека (JSON Schema)
{
  "type": "object",
  "required": ["event_type","amount","currency","ts_event","sign"],
  "properties": {
    "event_type": {"type":"string","enum":["payment","purchase","p2p","topup","conversion","fee","penalty","other"]},
    "amount": {"type":"number"},
    "currency": {"type":"string","minLength":3,"maxLength":3},
    "sign": {"type":"integer","enum":[-1,1]},
    "card_brand": {"type":"string"},
    "card_mask": {"type":"string"},
    "operator_raw": {"type":"string"},
    "operator_canonical": {"type":"string"},
    "operator_app": {"type":"string"},
    "merchant_name": {"type":"string"},
    "merchant_address": {"type":"string"},
    "balance_after": {"type":"number"},
    "balance_currency": {"type":"string","minLength":3,"maxLength":3},
    "ts_event": {"type":"string","format":"date-time"},
    "tz_hint": {"type":"string"},
    "lang": {"type":"string"},
    "confidence": {"type":"number"}
  }
}


Эта схема используется в Structured Outputs: модель обязана вернуть ровно такой JSON. 
platform.openai.com

5) Интеграция с OpenAI
5.1. Почему Responses API и как (вместо Assistants)

Официально объявлена миграция к Responses API как более простому и гибкому уровню; он поддерживает structured JSON, стриминг и тулы. Мы используем Responses как «движок» агента, с описанием наших функций. 
platform.openai.com
+1

5.2. Модели и маршрутизация

gpt‑5‑pro — для сложных, шумных, мультиязычных чеков/картинок и «тяжёлой» нормализации (в т. ч. извлечение из фото). 
platform.openai.com

gpt‑4o‑mini / gpt‑4.1‑nano — быстрые/дешёвые классификации: тип события, детект валюты, оператора (pre‑pass). 
platform.openai.com
+1

Vision/PDF поток — через мультимодальные входы файлов/картинок. 
platform.openai.com
+1

5.3. Тулы агента (function‑calling)

tool:extract_receipt — принимает raw_text/ocr_text/language_hint → возвращает объект по JSON‑схеме (см. §4.3).

tool:normalize_operator — на входе operator_raw, на выходе {canonical, app} по словарю (см. ниже).

tool:upsert_db — писатель (тонкий адаптер к Postgres), вызывается только после валидации.

tool:dedupe_check — вычисляет duplicate_key (хэш на {amount, ts ±60s, card_mask?, operator_canonical, sign} + хэш raw_text).

Примечание: в Responses/Tools можно объявлять как строгие JSON‑схемы для structured outputs, так и «кастомные» инструменты для произвольного ввода/вывода, что удобно для наших БД‑тулов. 
platform.openai.com
+1

5.4. Пример запроса (псевдо‑curl)
curl https://api.openai.com/v1/responses \
 -H "Authorization: Bearer $OPENAI_API_KEY" \
 -H "Content-Type: application/json" \
 -d '{
   "model": "gpt-5-pro",
   "input": [{"role":"user","content":[{"type":"input_text","text": "...сырой текст чека..."}]}],
   "response_format": {
     "type":"json_schema",
     "json_schema": { ... из §4.3 ... }
   },
   "tools": [
     {"type":"custom","name":"normalize_operator", "description":"maps raw operator string..."},
     {"type":"custom","name":"dedupe_check"},
     {"type":"custom","name":"upsert_db"}
   ]
 }'


Стриминг/реакции доступны, но для пакетной обработки лучше использовать Batch API. 
platform.openai.com

5.5. Batch и оффлайн‑обработка

Для очередей бэкфилла (исторические чаты, повторная обработка после обновления правил) — Batch API. 
platform.openai.com

5.6. Actions/доступ к данным

Для безопасного доступа к БД/индексам можно работать через «GPT Actions / data retrieval»: описываем эндпоинты, параметры, ACL. В нашем случае — отдельный internal API слой, агент вызывает upsert_db/lookup_operator как action. 
platform.openai.com

5.7. Качество и тонкая настройка

Если после ввода правил и Structured Outputs остаются частые ошибки в извлечении — готовим небольшой датасет и делаем SFT/тонкую подстройку под структуру чеков. 
platform.openai.com
+1

6) Нормализация операторов/приложений

Базовый словарь оператор→приложение берём из вашего файла и храним в operators + YAML рядом с кодом. Пример куска operators.yml:

- pattern: "OQ P2P(>.*)?|\\bOQ\\b"
  canonical: "OQ"
  app: "OQ"
- pattern: "NBU P2P HUMO UZCARD>|NBU ONLINE KONVERSIY|NBU 2P2 U PLAT UZCARD"
  canonical: "NBU"
  app: "Milliy 2.0"
- pattern: "SQB MOBILE HUMO P2P|SQB MOBILE UZCARD P2P UZCARD"
  canonical: "SQB MOBILE P2P"
  app: "SQB"
- pattern: "XAZNA.*|XAZNA PAYNET TOLOV"
  canonical: "XAZNA"
  app: "Xazna"
# ...


Основано на вашем словаре операторов/продавцов и их привязке к приложениям. Полный список — в файле проекта (см. источник).

7) Разбор примеров и тест‑набор

Берём ваши реальные уведомления (рус/узб) как golden set для автотестов и эвалов. Ниже — примеры полей, которые должны извлекаться стабильно:

HUMOCARD *6714: oplata 6000000.00 UZS; NBU P2P HUMO UZCARD>; 25-04-04 18:46; Dostupno: 935000.40 UZS
→ event_type=payment, amount=6000000, currency=UZS, card_mask=*6714, operator_raw=NBU P2P HUMO UZCARD>, operator_canonical=NBU, operator_app=Milliy 2.0, balance_after=935000.40, ts_event=2025-04-04T18:46:00+05:00.

🔴 Spisanie c karty ➖ 351 750.00 UZS ... UZCARD OTHERS 2 ANY PAYNET, 99 ...
→ event_type=fee|payment (в завис. от политики), operator_canonical=PAYNET.

💸 Конверсия ➖ 1 100.90 USD ...
→ event_type=conversion, amount=1100.90, currency=USD, sign=-1.

Узбекский/русский микс, вариации с запятыми 10.035.000,00 UZS — нормализуем к 10035000.00.

Эти кейсы включить в tests/evals/receipts_golden.jsonl и в пайплайн эвалов. Официальный гайд по эвалам — тут. 
platform.openai.com

8) Дедупликация

sig1 = sha1(lower(raw_text_clean))

sig2 = sha1(amount|currency|card_mask|operator_canonical|sign|floor(ts_event/60s))
Совпадение одной из сигнатур → потенциальный дубликат; если message_id совпадает — точно дубликат. Логика в dedupe_check.

9) Обработка изображений чеков

Если в Telegram приходят фото/PDF чеков — сохраняем оригинал и гоним через vision‑вход с извлечением тех же полей по JSON‑схеме. Поддержка изображений/страниц описана в оф. доках. 
platform.openai.com
+1

10) API для фронта

GET /api/receipts?filters... (пагинация, сортировка по ts_event)

GET /api/receipts/{id} (детали, ссылка на вложения)

POST /api/reparse/{id} (переобработка)

GET /api/operators (для фильтров)

11) Безопасность и секьюрный периметр

Секреты в Vault/Secrets Manager, токены Telegram/OpenAI в ENV.

Вебхук Телеграма — со скрытым URL + проверка IP/подписи.

PII шифровать at rest (pgcrypto) и в объектном хранилище (SSE‑S3).

Ролевая модель (RBAC): владелец данных видит только свои чеки.

12) Продакшн практики

Ретрай‑политика на вставку/вызовы API, идемпотентность по duplicate_key.

Метрички: время парсинга, % structured‑валидных, CER (classification error rate), CTR (conversion extract rate).

Лимиты/кэш: промпт‑кэш, роутинг на меньшие модели. Лучшие прод‑практики — в гайде. 
platform.openai.com

13) Бэклог (MVP → V2)

[MVP] Канал → парсер → таблица; базовая нормализация операторов.

[MVP] Дедуп; ручная переобработка.

[V2] Импорт истории (Batch). 
platform.openai.com

[V2] Сводные отчёты, экспорт CSV/XLSX.

[V2] Тонкая подстройка модели под ваши чеки.