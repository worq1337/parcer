FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm ci --omit=dev

# Копирование исходного кода
COPY . .

# Открытие порта
EXPOSE 3001

# Запуск приложения
CMD ["npm", "start"]
