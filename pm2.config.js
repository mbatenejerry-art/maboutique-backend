// pm2.config.js — Configuration PM2 pour MaBoutique Pro
// Usage :
//   pm2 start pm2.config.js              # SQLite (dev / VPS leger)
//   pm2 start pm2.config.js --env prod   # PostgreSQL (production)
//   pm2 save && pm2 startup              # Persistance apres reboot

module.exports = {
  apps: [
    {
      name: 'maboutique-api',
      script: './src/server.js',
      cwd: __dirname,

      // ---- Dev/local (SQLite, zero config) ----
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        DB_DRIVER: 'sqlite',
        SQLITE_FILE: './data/maboutique.db',
        JWT_SECRET: 'dev-change-me',
        CORS_ORIGIN: 'http://localhost:3000',
      },

      // ---- Production (PostgreSQL) ----
      env_prod: {
        NODE_ENV: 'production',
        PORT: 4000,
        DB_DRIVER: 'postgres',
        PGHOST: 'localhost',
        PGPORT: 5432,
        PGDATABASE: 'maboutique',
        PGUSER: 'maboutique_user',
        PGPASSWORD: 'CHANGER_CE_MOT_DE_PASSE',
        PGSSL: 'false',
        JWT_SECRET: 'CHANGER_AVEC_UNE_VALEUR_ALEATOIRE_LONGUE',
        JWT_EXPIRES_IN_HOURS: 12,
        CORS_ORIGIN: 'https://app.maboutique.cm',
      },

      // ---- Options PM2 ----
      instances: 1,           // Augmenter en cluster si plusieurs CPU
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      restart_delay: 2000,
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
