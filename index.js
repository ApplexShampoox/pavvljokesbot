const { Telegraf, Markup } = require('telegraf');
const mysql = require('mysql2/promise');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
require('dotenv').config();

// Настройка логгера с ротацией раз в месяц
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM', // Ротация раз в месяц
      maxSize: '50m', // Максимальный размер файла
      maxFiles: '12', // Хранить логи за 12 месяцев
    }),
  ],
});

// Создание пула соединений к базе данных
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

// Проверка соединения с базой данных
async function checkDatabaseConnection() {
  try {
    const [rows] = await pool.query('SELECT 1');
    logger.info('Database connection successful');
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
  }
}
checkDatabaseConnection();

// Функция для получения случайного анекдота
async function getRandomJoke() {
  try {
    const [rows] = await pool.query('SELECT joke_text FROM joke_base ORDER BY RAND() LIMIT 1');
    return rows[0]?.joke_text || null;
  } catch (error) {
    logger.error(`Error fetching joke from database: ${error.message}`);
    throw error;
  }
}

// Обработка ошибок
function handleError(ctx, error) {
  logger.error(`Error in bot: ${error.message}`);
  ctx.reply('Произошла ошибка. Пожалуйста, попробуйте еще раз позже.');
}

// Создание экземпляра бота
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  logger.info(`Bot started by user ${ctx.from.username}`);
  ctx.reply('Добро пожаловать!', Markup.keyboard([['Получить анекдот']]).resize());
});

bot.hears('Получить анекдот', async (ctx) => {
  try {
    const joke = await getRandomJoke();
    if (joke) {
      ctx.reply(joke);
    } else {
      ctx.reply('В базе данных нет анекдотов.');
    }
  } catch (error) {
    handleError(ctx, error);
  }
});

// Грациозное завершение работы
process.once('SIGINT', async () => {
  logger.info('SIGINT received. Closing bot and database pool...');
  await pool.end();
  bot.stop('SIGINT');
});

process.once('SIGTERM', async () => {
  logger.info('SIGTERM received. Closing bot and database pool...');
  await pool.end();
  bot.stop('SIGTERM');
});

bot.launch().then(() => {
  logger.info('Bot is up and running');
}).catch((error) => {
  logger.error(`Failed to launch bot: ${error.message}`);
});
