import React from 'react';
import Icon from '../icons/Icon';

/**
 * Bots list panel (left sidebar)
 */
const BotsList = ({ bots, selectedBotId, onSelectBot, loading }) => {
  if (loading && bots.length === 0) {
    return (
      <div className="bots-list-panel">
        <div className="bots-list-header">
          <h3>
            <Icon name="smart_toy" size={20} />
            Боты
          </h3>
        </div>
        <div className="bots-list-content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <div className="loading-text">Загрузка...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bots-list-panel">
      <div className="bots-list-header">
        <h3>
          <Icon name="smart_toy" size={20} />
          Боты ({bots.length})
        </h3>
      </div>
      <div className="bots-list-content">
        {bots.map(bot => {
          const totalNew = bot.stats?.new || 0;
          const totalProcessing = bot.stats?.processing || 0;
          const totalProcessed = bot.stats?.processed || 0;
          const totalError = bot.stats?.error || 0;

          return (
            <div
              key={bot.id}
              className={`bot-list-item ${selectedBotId === bot.id ? 'active' : ''}`}
              onClick={() => onSelectBot(bot.id)}
            >
              <div className="bot-list-item-header">
                <div className="bot-icon">{bot.icon}</div>
                <div className="bot-list-item-info">
                  <div className="bot-list-item-name">{bot.name}</div>
                  <div className="bot-list-item-username">{bot.username}</div>
                </div>
              </div>

              {(totalNew > 0 || totalProcessing > 0 || totalProcessed > 0 || totalError > 0) && (
                <div className="bot-list-item-stats">
                  {totalNew > 0 && (
                    <div className="bot-stat new">
                      ⏳ {totalNew}
                    </div>
                  )}
                  {totalProcessing > 0 && (
                    <div className="bot-stat processing">
                      🔄 {totalProcessing}
                    </div>
                  )}
                  {totalProcessed > 0 && (
                    <div className="bot-stat processed">
                      ✓ {totalProcessed}
                    </div>
                  )}
                  {totalError > 0 && (
                    <div className="bot-stat error">
                      ✗ {totalError}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BotsList;
