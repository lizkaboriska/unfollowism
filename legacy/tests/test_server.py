import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class ConnectionDiscoveryTests(unittest.TestCase):
    def test_discovers_all_follower_chunks_in_numeric_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ["followers_10.json", "followers_2.json", "followers_1.json", "not_followers.json"]:
                (root / name).write_text("[]", encoding="utf-8")

            with patch.object(server, "CONNECTIONS", root):
                names = [path.name for path in server.discover_follower_files()]

            self.assertEqual(names, ["followers_1.json", "followers_2.json", "followers_10.json"])


if __name__ == "__main__":
    unittest.main()
