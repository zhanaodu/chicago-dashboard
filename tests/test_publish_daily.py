import fcntl
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("publisher", Path(__file__).resolve().parents[1] / "scripts/publish_daily.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublishingTests(unittest.TestCase):
    def test_changed_data_committed_alone_and_pushed(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(publisher, "ROOT", Path(temp)), patch.object(publisher.subprocess, "run") as run:
            run.side_effect = lambda args, **kwargs: subprocess.CompletedProcess(args, 1 if "diff" in args else 0)
            publisher.main()
            commands = [call.args[0] for call in run.call_args_list]
            self.assertTrue(any("--only" in command and command[-1] == "assets/data.json" for command in commands))
            self.assertEqual(commands[-1][-3:], ("push", "origin", "main"))

    def test_unchanged_data_still_retries_push(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(publisher, "ROOT", Path(temp)), patch.object(publisher.subprocess, "run") as run:
            run.return_value = subprocess.CompletedProcess([], 0)
            publisher.main()
            commands = [call.args[0] for call in run.call_args_list]
            self.assertFalse(any("commit" in command for command in commands))
            self.assertEqual(commands[-1][-3:], ("push", "origin", "main"))

    def test_read_failure_never_publishes(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(publisher, "ROOT", Path(temp)), patch.object(publisher.subprocess, "run") as run:
            run.side_effect = [subprocess.CompletedProcess([], 0), subprocess.CalledProcessError(1, "sync")]
            with self.assertRaises(subprocess.CalledProcessError):
                publisher.main()
            self.assertEqual(run.call_count, 2)

    def test_concurrent_job_rejected_before_git(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(publisher, "ROOT", Path(temp)), patch.object(publisher.subprocess, "run") as run:
            (Path(temp) / "logs").mkdir()
            with (Path(temp) / "logs/publish.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaisesRegex(RuntimeError, "Another sync"):
                    publisher.main()
            run.assert_not_called()
