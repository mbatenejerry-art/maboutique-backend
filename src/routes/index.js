'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth, requireOwner } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

// 5 tentatives de connexion max par tranche de 15 minutes et par IP.
const loginLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

const authCtrl     = require('../controllers/authController');
const prodCtrl     = require('../controllers/productController');
const stockCtrl    = require('../controllers/stockEntryController');
const saleCtrl     = require('../controllers/saleController');
const reportCtrl   = require('../controllers/reportController');
const userCtrl     = require('../controllers/userController');
const boutiqueCtrl = require('../controllers/boutiqueController');

/* ---------------------------------------------------------------------- */
/* Sante (health-check, utile pour PM2 / Cloudflare Tunnel)               */
/* ---------------------------------------------------------------------- */
router.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ---------------------------------------------------------------------- */
/* Authentification                                                        */
/* ---------------------------------------------------------------------- */
router.post('/auth/register', authCtrl.register);
router.post('/auth/login',    loginLimiter, authCtrl.login);
router.get('/auth/me',        requireAuth, authCtrl.me);

/* ---------------------------------------------------------------------- */
/* Boutique                                                                */
/* ---------------------------------------------------------------------- */
router.get('/boutique',    requireAuth,              boutiqueCtrl.getBoutique);
router.put('/boutique',    requireAuth, requireOwner, boutiqueCtrl.updateBoutique);

/* ---------------------------------------------------------------------- */
/* Produits                                                                */
/* ---------------------------------------------------------------------- */
router.get('/products',        requireAuth,              prodCtrl.list);
router.post('/products',       requireAuth, requireOwner, prodCtrl.create);
router.put('/products/:id',    requireAuth, requireOwner, prodCtrl.update);
router.delete('/products/:id', requireAuth, requireOwner, prodCtrl.remove);

/* ---------------------------------------------------------------------- */
/* Entrees de stock                                                        */
/* ---------------------------------------------------------------------- */
router.get('/stock-entries',  requireAuth, requireOwner, stockCtrl.list);
router.post('/stock-entries', requireAuth, requireOwner, stockCtrl.create);

/* ---------------------------------------------------------------------- */
/* Ventes (creation : vendeur ET proprietaire; historique : scoped)        */
/* ---------------------------------------------------------------------- */
router.post('/sales',             requireAuth,              saleCtrl.create);
router.get('/sales',              requireAuth,              saleCtrl.list);
router.get('/sales/credit',       requireAuth, requireOwner, saleCtrl.listCredit);
router.patch('/sales/:id/paid',   requireAuth, requireOwner, saleCtrl.markCreditPaid);

/* ---------------------------------------------------------------------- */
/* Rapports (proprietaire uniquement)                                      */
/* ---------------------------------------------------------------------- */
router.get('/reports/dashboard', requireAuth,              reportCtrl.dashboard);
router.get('/reports/daily',     requireAuth, requireOwner, reportCtrl.daily);

/* ---------------------------------------------------------------------- */
/* Employes / utilisateurs                                                 */
/* ---------------------------------------------------------------------- */
router.get('/users',                    requireAuth, requireOwner, userCtrl.list);
router.post('/users',                   requireAuth, requireOwner, userCtrl.create);
router.patch('/users/:id/status',       requireAuth, requireOwner, userCtrl.toggleStatus);
router.put('/users/:id/password',       requireAuth, requireOwner, userCtrl.resetPassword);

/* ---------------------------------------------------------------------- */
/* Messages (signalement vendeur → proprietaire)                           */
/* ---------------------------------------------------------------------- */
router.get('/messages',          requireAuth, requireOwner, boutiqueCtrl.listMessages);
router.post('/messages',         requireAuth,              boutiqueCtrl.sendMessage);
router.patch('/messages/:id/read', requireAuth, requireOwner, boutiqueCtrl.markRead);

module.exports = router;
