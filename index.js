const telegramApi = require('node-telegram-bot-api');
const moment = require('moment-timezone');
const cron = require('node-cron');
const axios = require('axios');

const token = "7618603457:AAFFM4XYXrflVRu2bisIiC-05CHiLYgF";
const bot = new telegramApi(token, { polling: true });

const adminUserId = 777488290; // Замените на ID админа
const employees = {
    Тимофей: 911023506,
    Александр: 1909238538,
    Дмитрий: 777488290,
    Максим: 643138377,
};

let questionnaireData = {};
let userChatId = null; // Позиция для хранения ID пользователя, который отправил анкету
let waitingMessageId = null; // Позиция для хранения ID сообщения о рассмотрении анкеты

bot.on('message', (msg) => {
    console.log(msg);
});

const googleScriptUrlExpenses = 'https://script.google.com/macros/s/AKfycbwTw5VTpVYDbU1wkuTXCXYbFVzVtJRrHfRtJiyszILPgwHS-jtEzCjcN2IDGx2gv4c1/exec'; // Для расходников
const googleScriptUrlShift = 'https://script.google.com/macros/s/AKfycbwTw5VTpVYDbU1wkuTXCXYbFVzVtJRrHfRtJiyszILPgwHS-jtEzCjcN2IDGx2gv4c1/exec'; // Для смен

// Настройка ежедневной отправки сообщения
cron.schedule('50 19 * * *', () => {
    console.log('Задача сработала в', moment().tz('Europe/Moscow').format('YYYY-MM-DD HH:mm:ss'));
    bot.sendMessage(adminUserId, 'Кто сегодня на смене?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Тимофей', callback_data: 'employee_Тимофей' }],
                [{ text: 'Александр', callback_data: 'employee_Александр' }],
                [{ text: 'Дмитрий', callback_data: 'employee_Дмитрий' }],
            ],
        },
    }).catch(console.error);
}, {
    timezone: 'Europe/Moscow',
});

// Обработка нажатия на кнопки сотрудников
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('employee_')) {
        const employeeName = data.replace('employee_', '');
        const employeeId = employees[employeeName];

        if (employeeId) {
            bot.sendMessage(employeeId, 'Заполнить анкету по окончании смены.')
                .then(() => {
                    bot.sendMessage(adminUserId, `Сообщение отправлено ${employeeName}.`);
                })
                .catch(console.error);
        } else {
            bot.sendMessage(adminUserId, `Ошибка: ID для ${employeeName} не найден.`);
        }
    } else if (data === 'confirm_yes') {
        sendForApproval(chatId);
    } else if (data === 'confirm_no') {
        askForModification(chatId);
    } else if (data === 'cancel_questionnaire') {
        cancelQuestionnaire(chatId);
    } else if (data === 'approve_yes' || data === 'approve_no') {
        handleApproval(query, data);
    } else if (data.startsWith('modify_')) {
        modifyData(chatId, data.replace('modify_', '')); // удаляем 'modify_' и получаем имя свойства для изменения
    } else if (data === 'date_today' || data === 'date_yesterday') {
        handleDateSelection(chatId, data);
    }
});

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Добро пожаловать! Выберите действие:', {
        reply_markup: {
            keyboard: [['смена'], ['расходники']],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    });
});

// Обработка кнопки "смена"
bot.onText(/смена/, (msg) => {
    const chatId = msg.chat.id;
    userChatId = chatId; // Сохраняем ID пользователя
    questionnaireData = { type: 'смена' };
    bot.sendMessage(chatId, 'Выберите дату:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Сегодня', callback_data: 'date_today' }, { text: 'Вчера', callback_data: 'date_yesterday' }]
            ],
        },
    });
});

// Обработка кнопки "расходники"
bot.onText(/расходники/, (msg) => {
    const chatId = msg.chat.id;
    userChatId = chatId; // Сохраняем ID пользователя
    questionnaireData = { type: 'расходники' };
    bot.sendMessage(chatId, 'Выберите дату:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Сегодня', callback_data: 'date_today' }, { text: 'Вчера', callback_data: 'date_yesterday' }]
            ],
        },
    });
});

// Обработка выбора даты
function handleDateSelection(chatId, data) {
    if (data === 'date_today') {
        questionnaireData.date = moment().tz('Europe/Moscow').format('DD.MM.YYYY'); // Формат даты
    } else if (data === 'date_yesterday') {
        questionnaireData.date = moment().tz('Europe/Moscow').subtract(1, 'days').format('DD.MM.YYYY'); // Формат даты
    }

    if (questionnaireData.type === 'смена') {
        proceedToNameInput(chatId);
    } else if (questionnaireData.type === 'расходники') {
        proceedToSellerInput(chatId);
    }
}

// Функция для перехода к вводу ФИО сменщика
function proceedToNameInput(chatId) {
    bot.sendMessage(chatId, 'Введите ФИО сменщика:');
    bot.once('message', (msg) => {
        questionnaireData.name = msg.text;
        bot.sendMessage(chatId, 'Введите сумму выручки:');
        bot.once('message', (msg) => {
            questionnaireData.cash = msg.text;
            askForConfirmation(chatId);
        });
    });
}

// Функция для перехода к вводу имени продавца для "расходники"
function proceedToSellerInput(chatId) {
    bot.sendMessage(chatId, 'Введите имя продавца:');
    bot.once('message', (msg) => {
        questionnaireData.seller = msg.text;
        bot.sendMessage(chatId, 'Введите комментарий:');
        bot.once('message', (msg) => {
            questionnaireData.comment = msg.text;
            bot.sendMessage(chatId, 'Введите количество:');
            bot.once('message', (msg) => {
                questionnaireData.quantity = parseFloat(msg.text);
                bot.sendMessage(chatId, 'Введите цену за штуку:');
                bot.once('message', (msg) => {
                    questionnaireData.pricePerUnit = parseFloat(msg.text);
                    questionnaireData.totalAmount = questionnaireData.quantity * questionnaireData.pricePerUnit;
                    askForConfirmation(chatId);
                });
            });
        });
    });
}

// Запрос подтверждения
function askForConfirmation(chatId) {
    let message;
    if (questionnaireData.type === 'смена') {
        message = `Запись:\nДата: ${questionnaireData.date}\nФИО сменщика: ${questionnaireData.name}\nВыручка: ${questionnaireData.cash}\n\nЗапись корректна?`;
    } else if (questionnaireData.type === 'расходники') {
        message = `Запись:\nДата: ${questionnaireData.date}\nПродавец: ${questionnaireData.seller}\nКомментарий: ${questionnaireData.comment}\nКоличество: ${questionnaireData.quantity}\nЦена за шт.: ${questionnaireData.pricePerUnit}\nСумма: ${questionnaireData.totalAmount.toFixed(2)}\n\nЗапись корректна?`;
    }

    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Да', callback_data: 'confirm_yes' }, { text: 'Нет', callback_data: 'confirm_no' }],
                [{ text: 'Отменить анкету', callback_data: 'cancel_questionnaire' }]
            ]
        }
    });
}

// Функция для отмены анкеты
function cancelQuestionnaire(chatId) {
    questionnaireData = {}; // Очищаем данные анкеты
    bot.sendMessage(chatId, 'Анкета отменена. Вы можете начать заново, выбрав команду /start.');
}

// Функция для выбора свойства для изменения
function askForModification(chatId) {
    const keyboard = [
        [{ text: 'Дата', callback_data: 'modify_date' }],
        [{ text: 'ФИО сменщика', callback_data: 'modify_name' }],
        [{ text: 'Выручка', callback_data: 'modify_cash' }]
    ];

    if (questionnaireData.type === 'расходники') {
        keyboard.push([{ text: 'Имя продавца', callback_data: 'modify_seller' }]);
        keyboard.push([{ text: 'Комментарий', callback_data: 'modify_comment' }]);
        keyboard.push([{ text: 'Количество', callback_data: 'modify_quantity' }]);
        keyboard.push([{ text: 'Цена за штуку', callback_data: 'modify_pricePerUnit' }]);
    }

    bot.sendMessage(chatId, 'Выберите поле для изменения:', {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
}

// Функция для изменения данных
function modifyData(chatId, field) {
    let promptMessage = '';

    switch (field) {
        case 'date':
            promptMessage = 'Введите новую дату:';
            break;
        case 'name':
            promptMessage = 'Введите новое ФИО сменщика:';
            break;
        case 'cash':
            promptMessage = 'Введите новую сумму выручки:';
            break;
        case 'seller':
            promptMessage = 'Введите новое имя продавца:';
            break;
        case 'comment':
            promptMessage = 'Введите новый комментарий:';
            break;
        case 'quantity':
            promptMessage = 'Введите новое количество:';
            break;
        case 'pricePerUnit':
            promptMessage = 'Введите новую цену за штуку:';
            break;
    }

    bot.sendMessage(chatId, promptMessage);
    bot.once('message', (msg) => {
        // Обновляем соответствующее поле в анкете
        switch (field) {
            case 'date':
                questionnaireData.date = msg.text;
                break;
            case 'name':
                questionnaireData.name = msg.text;
                break;
            case 'cash':
                questionnaireData.cash = msg.text;
                break;
            case 'seller':
                questionnaireData.seller = msg.text;
                break;
            case 'comment':
                questionnaireData.comment = msg.text;
                break;
            case 'quantity':
                questionnaireData.quantity = parseFloat(msg.text);
                // Пересчитываем общую сумму, если изменяется количество
                questionnaireData.totalAmount = questionnaireData.quantity * questionnaireData.pricePerUnit;
                break;
            case 'pricePerUnit':
                questionnaireData.pricePerUnit = parseFloat(msg.text);
                // Пересчитываем общую сумму, если изменяется цена за штуку
                questionnaireData.totalAmount = questionnaireData.quantity * questionnaireData.pricePerUnit;
                break;
        }
        // После изменения данных, повторно предлагается подтверждение
        askForConfirmation(chatId);
    });
}

// Отправка анкеты на одобрение
function sendForApproval(chatId) {
    bot.sendMessage(chatId, 'Подождите, ваша анкета на рассмотрении.')
        .then((message) => {
            waitingMessageId = message.message_id; // Сохраняем идентификатор сообщения
        });

    let message;
    if (questionnaireData.type === 'смена') {
        message = `Запись на подтверждение:\nДата: ${questionnaireData.date}\nФИО сменщика: ${questionnaireData.name}\nВыручка: ${questionnaireData.cash}\n\nПодтверждаете?`;
    } else if (questionnaireData.type === 'расходники') {
        message = `Запись на подтверждение:\nДата: ${questionnaireData.date}\nПродавец: ${questionnaireData.seller}\nКомментарий: ${questionnaireData.comment}\nКоличество: ${questionnaireData.quantity}\nЦена за шт.: ${questionnaireData.pricePerUnit}\nСумма: ${questionnaireData.totalAmount.toFixed(2)}\n\nПодтверждаете?`;
    }

    bot.sendMessage(adminUserId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Подтверждаю', callback_data: 'approve_yes' }, { text: 'Не подтверждаю', callback_data: 'approve_no' }]
            ]
        }
    });
}

// Обработка подтверждения анкеты администратором
function handleApproval(query, data) {
    const chatId = query.message.chat.id;

    if (data === 'approve_yes') {
        sendToGoogleSheets(questionnaireData)
            .then(() => {
                if (waitingMessageId) {
                    bot.deleteMessage(chatId, waitingMessageId) // Удаляем сообщение о рассмотрении анкеты
                        .catch(console.error);
                }
                bot.sendMessage(chatId, 'Анкета подтверждена и сохранена.');

                // Уведомление пользователя
                if (userChatId) {
                    bot.sendMessage(userChatId, 'Ваша анкета подтверждена.');
                }
            })
            .catch((error) => {
                console.error('Ошибка при отправке данных:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при сохранении анкеты.');
            });
    } else if (data === 'approve_no') {
        if (waitingMessageId) {
            bot.deleteMessage(chatId, waitingMessageId) // Удаляем сообщение о рассмотрении анкеты
                .catch(console.error);
        }
        bot.sendMessage(chatId, 'Анкета не подтверждена. Пожалуйста, заполните анкету снова.');

        // Уведомление пользователя
        if (userChatId) {
            bot.sendMessage(userChatId, 'Ваша анкета не подтверждена. Пожалуйста, заполните анкету снова.');
        }
    }
}

// Функция для отправки данных в Google Sheets
async function sendToGoogleSheets(data) {
    try {
        let payload;
        let url;

        if (data.type === 'смена') {
            payload = new URLSearchParams({
                type: 'смена',
                date: data.date,
                barista: data.name,
                cash: data.cash,
            });
            url = googleScriptUrlShift; // URL для таблицы "Смены"
        } else if (data.type === 'расходники') {
            payload = new URLSearchParams({
                type: 'расходники',
                date: data.date,
                seller: data.seller,
                comment: data.comment,
                quantity: data.quantity,
                pricePerUnit: data.pricePerUnit,
                totalAmount: data.totalAmount.toFixed(2),
            });
            url = googleScriptUrlExpenses; // URL для таблицы "Расходы"
        } else {
            throw new Error('Неизвестный тип анкеты');
        }

        console.log('Отправляемые данные:', payload.toString());
        console.log('Отправка данных на URL:', url);

        const response = await axios.post(url, payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        console.log('Данные успешно отправлены:', response.data);
    } catch (error) {
        console.error('Ошибка при отправке данных:', error.message);
        throw error; // Пробрасываем ошибку для обработки в вызывающем коде
    }
}