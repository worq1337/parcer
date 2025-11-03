import React, { useState } from 'react';
import { Check, Clock, AlertCircle, Database, Eye, Trash2, Table, Square, CheckSquare } from 'lucide-react';
import { useUserbotChat } from '../../hooks/useUserbotChat';

/**
 * Modern Telegram-style Userbot Chat Layout (v2.1)
 * Full UI replacement with Tailwind CSS + Lucide Icons
 * + Mass selection functionality
 */
const UserbotChatLayout = () => {
  const {
    bots,
    selectedBotId,
    messages,
    botsLoading,
    messagesLoading,
    refreshing,
    statusFilter,
    selectBot,
    changeStatusFilter,
    refresh,
    processMessage,
    retryMessage
  } = useUserbotChat();

  const [viewingDetails, setViewingDetails] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState(new Set());

  // Debug logging
  console.log('[UserbotChatLayout] Render:', {
    botsCount: bots.length,
    botsLoading,
    selectedBotId,
    messagesCount: messages.length,
    messagesLoading,
    bots: bots.map(b => ({ id: b.id, name: b.name }))
  });

  // Helper functions
  const formatMessageDate = (dateString) => {
    const messageDate = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (messageDateOnly.getTime() === todayOnly.getTime()) {
      return 'Сегодня';
    } else if (messageDateOnly.getTime() === yesterdayOnly.getTime()) {
      return 'Вчера';
    } else {
      const day = messageDate.getDate().toString().padStart(2, '0');
      const month = (messageDate.getMonth() + 1).toString().padStart(2, '0');
      const year = messageDate.getFullYear();
      return `${day}.${month}.${year}`;
    }
  };

  const formatTime = (datetime) => {
    const date = new Date(datetime);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const groupMessagesByDate = (msgs) => {
    const groups = {};
    msgs.forEach(msg => {
      const dateKey = formatMessageDate(msg.timestamp || msg.datetime || msg.created_at);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const getStatusBadge = (status) => {
    const badges = {
      new: { color: 'bg-blue-500', icon: Clock, text: 'Новое' },
      unprocessed: { color: 'bg-blue-500', icon: Clock, text: 'Новое' },
      processing: { color: 'bg-yellow-500', icon: Clock, text: 'В обработке' },
      processed: { color: 'bg-green-500', icon: Check, text: 'Обработано' },
      error: { color: 'bg-red-500', icon: AlertCircle, text: 'Ошибка' }
    };

    const badge = badges[status] || badges.new;
    const Icon = badge.icon;

    return (
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs text-white ${badge.color}`}>
        <Icon size={12} />
        <span>{badge.text}</span>
      </div>
    );
  };

  const handleShowInTable = (msg) => {
    if (msg.check_id) {
      window.location.hash = `#/?view=checks&highlight=${msg.check_id}`;
    } else {
      alert('Запись еще не добавлена в БД');
    }
  };

  const handleDelete = async (msgId) => {
    if (window.confirm('Вы уверены, что хотите удалить это сообщение?')) {
      alert(`Удаление сообщения #${msgId} (API not implemented yet)`);
    }
  };

  // Mass selection handlers
  const toggleMessageSelection = (msgId) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(msgId)) {
        newSet.delete(msgId);
      } else {
        newSet.add(msgId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMessages.size === filteredMessages.length && filteredMessages.length > 0) {
      setSelectedMessages(new Set());
    } else {
      setSelectedMessages(new Set(filteredMessages.map(msg => msg.id)));
    }
  };

  const handleMassProcess = async () => {
    const messagesToProcess = filteredMessages.filter(msg => selectedMessages.has(msg.id));
    if (messagesToProcess.length === 0) return;

    if (window.confirm(`Обработать ${messagesToProcess.length} сообщений?`)) {
      for (const msg of messagesToProcess) {
        await processMessage(msg);
      }
      setSelectedMessages(new Set());
      refresh();
    }
  };

  const handleMassDelete = async () => {
    if (selectedMessages.size === 0) return;

    if (window.confirm(`Удалить ${selectedMessages.size} сообщений?`)) {
      alert(`Массовое удаление ${selectedMessages.size} сообщений (API not implemented yet)`);
      setSelectedMessages(new Set());
    }
  };

  const currentBot = bots.find(b => b.id === selectedBotId);
  const filteredMessages = messages;

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Left Panel - Bots List */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold mb-1">Парсер банковских чеков</h1>
          <p className="text-sm text-gray-400">Telegram Userbot</p>
        </div>

        <div className="p-3 border-b border-gray-700">
          <div className="text-xs text-gray-400 mb-2">Боты ({bots.length})</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {botsLoading ? (
            <div className="p-4 text-center text-gray-400">Загрузка...</div>
          ) : bots.length === 0 ? (
            <div className="p-4 text-center text-gray-400">Нет ботов</div>
          ) : (
            bots.map(bot => (
              <div
                key={bot.id}
                onClick={() => selectBot(bot.id)}
                className={`p-4 border-b border-gray-700 cursor-pointer transition-colors ${
                  selectedBotId === bot.id ? 'bg-blue-600' : 'hover:bg-gray-750'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                    {(bot.name || bot.username || 'BT').substring(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{bot.name || bot.username || `ID${bot.id}`}</div>
                    <div className="text-sm text-gray-400 truncate">{bot.username || '(недоступен)'}</div>

                    <div className="flex gap-2 mt-2 text-xs">
                      <span className="bg-blue-600 px-2 py-1 rounded flex items-center gap-1">
                        <span className="font-bold">{(bot.stats?.new || 0) + (bot.stats?.processing || 0) + (bot.stats?.processed || 0) + (bot.stats?.error || 0)}</span>
                      </span>
                      {(bot.stats?.new || 0) > 0 && (
                        <span className="bg-blue-500 px-2 py-1 rounded">{bot.stats.new}</span>
                      )}
                      {(bot.stats?.processing || 0) > 0 && (
                        <span className="bg-yellow-500 px-2 py-1 rounded">{bot.stats.processing}</span>
                      )}
                      {(bot.stats?.error || 0) > 0 && (
                        <span className="bg-red-500 px-2 py-1 rounded">{bot.stats.error}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Messages (continuing in next block due to length) */}
      <div className="flex-1 flex flex-col">
        <div className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                {currentBot ? (currentBot.name || currentBot.username || 'BT').substring(0, 2).toUpperCase() : 'BT'}
              </div>
              <div>
                <div className="font-semibold">{currentBot?.name || currentBot?.username || 'Выберите бота'}</div>
                <div className="text-sm text-gray-400">Всего сообщений: {currentBot?.stats ? ((currentBot.stats.new || 0) + (currentBot.stats.processing || 0) + (currentBot.stats.processed || 0) + (currentBot.stats.error || 0)) : 0}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {filteredMessages.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2"
                  title={selectedMessages.size === filteredMessages.length ? 'Снять выделение' : 'Выбрать все'}
                >
                  {selectedMessages.size === filteredMessages.length && filteredMessages.length > 0 ? (
                    <CheckSquare size={18} />
                  ) : (
                    <Square size={18} />
                  )}
                  <span className="text-sm">
                    {selectedMessages.size > 0 ? `${selectedMessages.size} / ${filteredMessages.length}` : 'Выбрать все'}
                  </span>
                </button>
              )}

              <button
                onClick={refresh}
                disabled={refreshing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg transition-colors"
              >
                {refreshing ? 'Обновление...' : 'Обновить'}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            {['all', 'new', 'processing', 'processed', 'error'].map(filter => (
              <button
                key={filter}
                onClick={() => changeStatusFilter(filter)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  statusFilter === filter ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {filter === 'all' ? 'Все' : filter === 'new' ? 'Новые' : filter === 'processing' ? 'В обработке' : filter === 'processed' ? 'Обработано' : 'Ошибки'}
                {filter === 'all' && <span className="ml-1 text-xs opacity-75">{messages.length}</span>}
              </button>
            ))}
          </div>

          {/* Mass actions panel */}
          {selectedMessages.size > 0 && (
            <div className="mt-4 p-3 bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckSquare size={18} className="text-blue-400" />
                <span className="font-semibold">Выбрано: {selectedMessages.size}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleMassProcess}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Check size={16} />
                  Обработать все
                </button>
                <button
                  onClick={handleMassDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Trash2 size={16} />
                  Удалить все
                </button>
                <button
                  onClick={() => setSelectedMessages(new Set())}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium"
                >
                  Отменить
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messagesLoading && messages.length === 0 ? (
            <div className="text-center text-gray-400 mt-8">
              <Clock size={48} className="mx-auto mb-4 opacity-50 animate-spin" />
              <p>Загрузка сообщений...</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="text-center text-gray-400 mt-8">
              <Clock size={48} className="mx-auto mb-4 opacity-50" />
              <p>Нет сообщений для отображения</p>
            </div>
          ) : (
            (() => {
              const groupedMessages = groupMessagesByDate(filteredMessages);
              const dateKeys = Object.keys(groupedMessages);

              return dateKeys.map(dateKey => (
                <div key={dateKey} className="space-y-3">
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-700"></div>
                    <div className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300">
                      {dateKey}
                    </div>
                    <div className="flex-1 h-px bg-gray-700"></div>
                  </div>

                  {groupedMessages[dateKey].map(msg => {
                    const msgData = msg.data || {};
                    const hasCheckInDB = !!msg.check_id || msg.status === 'processed';
                    const isSelected = selectedMessages.has(msg.id);

                    return (
                      <div key={msg.id} className={`bg-gray-800 rounded-lg p-4 shadow-lg transition-all ${
                        isSelected ? 'ring-2 ring-blue-500 bg-blue-900 bg-opacity-20' : ''
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleMessageSelection(msg.id)}
                              className="flex-shrink-0 w-6 h-6 flex items-center justify-center hover:bg-gray-700 rounded transition-colors"
                            >
                              {isSelected ? (
                                <CheckSquare size={20} className="text-blue-400" />
                              ) : (
                                <Square size={20} className="text-gray-500" />
                              )}
                            </button>

                            <div className={`w-3 h-3 rounded-full ${
                              (msgData.amount && msgData.amount < 0) ? 'bg-red-500' : 'bg-green-500'
                            }`}></div>
                            <span className="font-semibold">{msgData.operator || msgData.merchant || 'Операция'}</span>
                            <span className="text-gray-400 text-sm">{formatTime(msg.timestamp || msg.datetime || msg.created_at)}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {getStatusBadge(msg.status)}
                            {hasCheckInDB && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-600 text-white">
                                <Database size={12} />
                                <span>В БД</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-gray-750 rounded-lg p-3 mb-3 text-sm text-gray-300">
                          {msg.text || 'Нет текста сообщения'}
                        </div>

                        {msgData && Object.keys(msgData).length > 0 && (
                          <div className="bg-gray-750 rounded-lg p-4 mb-3">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              {msgData.amount && (
                                <div>
                                  <div className="text-gray-400 mb-1">СУММА</div>
                                  <div className={`text-xl font-bold ${
                                    msgData.amount < 0 ? 'text-red-400' : 'text-green-400'
                                  }`}>
                                    {parseFloat(msgData.amount).toLocaleString('ru-RU', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })} {msgData.currency || 'UZS'}
                                  </div>
                                </div>
                              )}

                              {msgData.balance && (
                                <div>
                                  <div className="text-gray-400 mb-1">БАЛАНС</div>
                                  <div className="text-lg font-semibold">
                                    {parseFloat(msgData.balance).toLocaleString('ru-RU', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })} {msgData.currency || 'UZS'}
                                  </div>
                                </div>
                              )}

                              {(msgData.merchant || msgData.recipient) && (
                                <div className="col-span-2">
                                  <div className="text-gray-400 mb-1">ПОЛУЧАТЕЛЬ</div>
                                  <div className="font-medium">{msgData.merchant || msgData.recipient}</div>
                                </div>
                              )}

                              {(msgData.card || msgData.card_last4) && (
                                <div>
                                  <div className="text-gray-400 mb-1">КАРТА</div>
                                  <div className="font-medium">***{msgData.card || msgData.card_last4}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {msg.error && (
                          <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-3 mb-3 flex items-center gap-2 text-sm">
                            <AlertCircle size={16} className="text-red-400" />
                            <span className="text-red-300">{msg.error}</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {(msg.status === 'new' || msg.status === 'unprocessed') && (
                            <button
                              onClick={() => processMessage(msg)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                              <Check size={16} />
                              Обработать
                            </button>
                          )}

                          {msg.status === 'processing' && (
                            <button
                              onClick={() => processMessage(msg)}
                              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                              <Clock size={16} />
                              Завершить обработку
                            </button>
                          )}

                          {msg.status === 'error' && (
                            <button
                              onClick={() => retryMessage(msg.id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                              <AlertCircle size={16} />
                              Повторить
                            </button>
                          )}

                          {!hasCheckInDB && (
                            <button
                              onClick={() => processMessage(msg)}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                              <Database size={16} />
                              Добавить в БД
                            </button>
                          )}

                          <button
                            onClick={() => setViewingDetails(msg)}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                          >
                            <Eye size={16} />
                            Детали
                          </button>

                          {hasCheckInDB && (
                            <button
                              onClick={() => handleShowInTable(msg)}
                              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                              <Table size={16} />
                              Показать в таблице
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="px-4 py-2 bg-gray-700 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ml-auto"
                          >
                            <Trash2 size={16} />
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
      </div>

      {viewingDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setViewingDetails(null)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Детали сообщения #{viewingDetails.id}</h2>
            <pre className="bg-gray-900 p-4 rounded text-sm overflow-x-auto text-gray-300">
              {JSON.stringify(viewingDetails, null, 2)}
            </pre>
            <button
              onClick={() => setViewingDetails(null)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserbotChatLayout;
