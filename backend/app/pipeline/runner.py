import asyncio
import logging
import signal
from typing import List, Optional

from app.pipeline.workers import (
    run_fetch_worker,
    run_parse_worker,
    run_chunk_worker,
    run_embed_worker,
    run_store_worker,
    run_dlq_worker,
)

logger = logging.getLogger(__name__)

_stop_event: Optional[asyncio.Event] = None
_worker_tasks: List[asyncio.Task] = []


async def start_pipeline_workers(in_background: bool = True) -> asyncio.Event:
    """
    Spawns all 5 stage workers and the DLQ worker concurrently.
    If in_background is True, tasks run detached in background.
    """
    global _stop_event, _worker_tasks

    _stop_event = asyncio.Event()
    worker_coroutines = [
        run_fetch_worker(_stop_event),
        run_parse_worker(_stop_event),
        run_chunk_worker(_stop_event),
        run_embed_worker(_stop_event),
        run_store_worker(_stop_event),
        run_dlq_worker(_stop_event),
    ]

    _worker_tasks = [asyncio.create_task(coro) for coro in worker_coroutines]
    logger.info("Spawned %d pipeline workers concurrently.", len(_worker_tasks))

    if not in_background:
        await asyncio.gather(*_worker_tasks, return_exceptions=True)

    return _stop_event


async def stop_pipeline_workers() -> None:
    """Signals all workers to gracefully stop and waits for completion."""
    global _stop_event, _worker_tasks

    if _stop_event is not None:
        _stop_event.set()

    if _worker_tasks:
        logger.info("Cancelling %d pipeline worker tasks...", len(_worker_tasks))
        for task in _worker_tasks:
            task.cancel()
        await asyncio.gather(*_worker_tasks, return_exceptions=True)
        _worker_tasks.clear()
        logger.info("All pipeline workers stopped.")


def main():
    """Standalone entrypoint for running workers as a dedicated background process."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
    )
    logger.info("Starting Cloud PDF Reader Kafka Pipeline Workers...")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Received termination signal. Shutting down...")
        stop_event.set()

    # Register OS signals where supported
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            # Windows does not support add_signal_handler in all event loops
            pass

    async def run():
        tasks = [
            asyncio.create_task(run_fetch_worker(stop_event)),
            asyncio.create_task(run_parse_worker(stop_event)),
            asyncio.create_task(run_chunk_worker(stop_event)),
            asyncio.create_task(run_embed_worker(stop_event)),
            asyncio.create_task(run_store_worker(stop_event)),
            asyncio.create_task(run_dlq_worker(stop_event)),
        ]
        logger.info("All 6 Kafka workers active and listening to topics.")
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

    try:
        loop.run_until_complete(run())
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received. Stopping workers...")
        stop_event.set()
    finally:
        loop.close()
        logger.info("Pipeline worker process terminated.")


if __name__ == "__main__":
    main()
