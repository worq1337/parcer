import React from 'react';
import BotsList from './BotsList';
import ChatPanel from './ChatPanel';
import { useUserbotChat } from '../../hooks/useUserbotChat';
import '../../styles/UserbotChat.css';

/**
 * Main Userbot Chat Layout component
 * Manages chat functionality for userbot messages
 */
const UserbotChatLayout = () => {
  const {
    // State
    bots,
    selectedBotId,
    messages,
    loading,
    refreshing,
    statusFilter,
    selectedMessages,

    // Actions
    selectBot,
    changeStatusFilter,
    refresh,
    processMessage,
    processMultiple,
    retryMessage,
    toggleMessageSelection,
    selectAll,
    clearSelection
  } = useUserbotChat();

  // Find currently selected bot
  const selectedBot = bots.find(bot => bot.id === selectedBotId);

  // Handle bulk processing
  const handleProcessSelected = () => {
    if (selectedMessages.size === 0) return;

    const messageIds = Array.from(selectedMessages);
    processMultiple(messageIds);
  };

  return (
    <div className="userbot-chat-layout">
      <BotsList
        bots={bots}
        selectedBotId={selectedBotId}
        onSelectBot={selectBot}
        loading={loading}
      />

      <ChatPanel
        bot={selectedBot}
        messages={messages}
        statusFilter={statusFilter}
        onChangeFilter={changeStatusFilter}
        selectedMessages={selectedMessages}
        onToggleSelection={toggleMessageSelection}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onProcessMessage={processMessage}
        onProcessSelected={handleProcessSelected}
        onRetryMessage={retryMessage}
        onRefresh={refresh}
        refreshing={refreshing}
        loading={loading}
      />
    </div>
  );
};

export default UserbotChatLayout;
