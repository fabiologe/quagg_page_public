module.exports = {
  apps: [{
    name: "quagg-api",
    script: "/home/fabio/quagg_page/backend/app/main.py",
    cwd: "/home/fabio/quagg_page/backend",
    interpreter: "/home/fabio/quagg_page/backend/venv/bin/python",
    env: {
      PYTHONPATH: "/home/fabio/quagg_page/backend"
    }
  }, {
    name: "quagg-email-worker",
    script: "/home/fabio/quagg_page/backend/app/tasks/worker_email_ingest.py",
    cwd: "/home/fabio/quagg_page/backend",
    interpreter: "/home/fabio/quagg_page/backend/venv/bin/python",
    env: {
      PYTHONPATH: "/home/fabio/quagg_page/backend"
    }
  }
  ]
} 