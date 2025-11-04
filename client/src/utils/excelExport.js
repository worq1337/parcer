import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { formatDateTime, formatCardLast4 } from './formatters';

export const exportToExcel = async (checks) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Чеки');

  // Настройка колонок согласно patch-019 §1
  worksheet.columns = [
    { header: '№ чека', key: 'id', width: 10 },
    { header: 'Дата и время', key: 'datetime', width: 20 },
    { header: 'Оператор/Продавец', key: 'operator', width: 35 },
    { header: 'Приложение', key: 'app', width: 20 },
    { header: 'Сумма', key: 'amount', width: 15 },
    { header: 'Остаток', key: 'balance', width: 15 },
    { header: 'ПК', key: 'card_last4', width: 8 },
    { header: 'P2P', key: 'is_p2p', width: 6 },
    { header: 'Тип транзакции', key: 'transaction_type', width: 18 },
    { header: 'Валюта', key: 'currency', width: 10 },
    { header: 'Источник данных', key: 'source', width: 15 }
  ];

  // Стилизация заголовка
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4A90E2' }
  };
  worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Добавление данных
  checks.forEach(check => {
    // patch-019 §1: Форматируем дату через formatDateTime (ДД.ММ.ГГГГ ЧЧ:ММ)
    // patch-019 §2: Форматируем ПК через formatCardLast4 (только 4 цифры, без *)
    const row = worksheet.addRow({
      id: check.id,
      datetime: formatDateTime(check.datetime),
      operator: check.operator,
      app: check.app || '—',
      amount: check.amount,
      balance: check.balance,
      card_last4: formatCardLast4(check.card_last4),
      is_p2p: check.is_p2p ? '1' : '0',
      transaction_type: check.transaction_type,
      currency: check.currency,
      source: check.source
    });

    // Цветовое выделение для расходов/доходов
    const amountCell = row.getCell('amount');
    if (check.amount < 0) {
      amountCell.font = { color: { argb: 'FFF44336' } };
    } else {
      amountCell.font = { color: { argb: 'FF4CAF50' } };
    }

    // Форматирование чисел
    amountCell.numFmt = '#,##0.00';
    const balanceCell = row.getCell('balance');
    if (check.balance) {
      balanceCell.numFmt = '#,##0.00';
    }
  });

  // Автоматическая ширина колонок (альтернативный метод)
  worksheet.columns.forEach(column => {
    column.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  // Генерация файла
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const date = new Date().toISOString().split('T')[0];
  saveAs(blob, `checks_export_${date}.xlsx`);
};

export const importFromExcel = async (file) => {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  const checks = [];

  worksheet.eachRow((row, rowNumber) => {
    // Пропускаем заголовок
    if (rowNumber === 1) return;

    // Структура совпадает с экспортом:
    // 1: id, 2: datetime, 3: operator, 4: app, 5: amount, 6: balance,
    // 7: card_last4, 8: is_p2p, 9: transaction_type, 10: currency, 11: source
    const check = {
      // id не импортируем (будет создан на сервере)
      datetime: row.getCell(2).value, // Формат: "ДД.ММ.ГГГГ ЧЧ:ММ"
      operator: row.getCell(3).value,
      app: row.getCell(4).value === '—' ? null : row.getCell(4).value,
      amount: parseFloat(row.getCell(5).value),
      balance: row.getCell(6).value ? parseFloat(row.getCell(6).value) : null,
      card_last4: row.getCell(7).value, // Только 4 цифры
      is_p2p: row.getCell(8).value === '1',
      transaction_type: row.getCell(9).value,
      currency: row.getCell(10).value,
      source: row.getCell(11).value || 'Import'
    };

    checks.push(check);
  });

  return checks;
};
