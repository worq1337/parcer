import unittest
from datetime import datetime, timedelta, timezone

from services.userbot.userbot import UserbotManager
from services.userbot import config as cfg


class UserbotHelpersTest(unittest.TestCase):
    def test_is_old_message_recent(self):
        mgr = UserbotManager()
        mgr.max_message_age = 1  # минута
        recent = datetime.now(timezone.utc) - timedelta(seconds=10)
        is_old, age_seconds = mgr._is_old_message(recent)
        self.assertFalse(is_old)
        self.assertLess(age_seconds, 60)

    def test_is_old_message_old(self):
        mgr = UserbotManager()
        mgr.max_message_age = 1  # минута
        old_dt = datetime.now(timezone.utc) - timedelta(minutes=3)
        is_old, age_seconds = mgr._is_old_message(old_dt)
        self.assertTrue(is_old)
        self.assertGreaterEqual(age_seconds, 180)

    def test_validate_config_accepts_valid_values(self):
        old_api_id = cfg.API_ID
        old_api_hash = cfg.API_HASH
        old_monitor = cfg.MONITOR_BOT_IDS
        old_bot = cfg.OUR_BOT_ID
        cfg.API_ID = 1
        cfg.API_HASH = 'hash'
        cfg.MONITOR_BOT_IDS = [123]
        cfg.OUR_BOT_ID = 999
        try:
            UserbotManager()._validate_config()
        finally:
            cfg.API_ID = old_api_id
            cfg.API_HASH = old_api_hash
            cfg.MONITOR_BOT_IDS = old_monitor
            cfg.OUR_BOT_ID = old_bot


if __name__ == '__main__':
    unittest.main()

