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

    const check = {
      datetime: row.getCell(2).value,
      weekday: row.getCell(3).value,
      dateDisplay: row.getCell(4).value,
      timeDisplay: row.getCell(5).value,
      operator: row.getCell(6).value,
      app: row.getCell(7).value === '—' ? null : row.getCell(7).value,
      amount: parseFloat(row.getCell(8).value),
      balance: row.getCell(9).value ? parseFloat(row.getCell(9).value) : null,
      cardLast4: row.getCell(10).value,
      isP2p: row.getCell(11).value === '1',
      transactionType: row.getCell(12).value,
      currency: row.getCell(13).value,
      source: row.getCell(14).value || 'Import',
      addedVia: 'import'
    };

    checks.push(check);
  });

  return checks;
};
