require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit'); // Proteção contra abusos e robôs

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- MIDDLEWARES ---
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

// --- SEGURANÇA: RATE LIMIT ---
// Limita a 5 tentativas de inscrição a cada 15 minutos por IP para evitar SPAM
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2,
  message: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Muitas tentativas de inscrição.</h2>
          <p>Tente novamente em 15 minutos.</p>
        </div>`,
  standardHeaders: true,
  legacyHeaders: false,
});

// --- FUNÇÕES AUXILIARES ---
function getNewsletterHtml(vars = {}) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'newsletter.html'), 'utf8');
  html = html
    .replace(/'.COMPANY_NAME.'/g, vars.COMPANY_NAME)
    .replace(/'.LOGO_URL.'/g, vars.LOGO_URL)
    .replace(/'.COMPANY_WEBSITE.'/g, vars.COMPANY_WEBSITE)
    .replace(/'.UNSUBSCRIBE_URL.'/g, vars.UNSUBSCRIBE_URL)
    .replace(/'.date\('Y'\).'|{{YEAR}}/g, new Date().getFullYear());
  return html;
}

// --- ROTAS ---

// Rota principal: Entrega a interface do formulário
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota de Inscrição: Com validação, sanitização e proteção contra SQL Injection
app.post('/subscribe', subscribeLimiter, async (req, res) => {
  let email = req.body.email;

  // 1. Sanitização Básica e Validação com Regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).send('Por favor, insira um e-mail válido.');
  }

  // 2. Normalização (Remove espaços e converte para minúsculo)
  email = email.trim().toLowerCase();

  try {
    // 3. Verificação de Duplicidade (Protegido contra SQL Injection via $1)
    const check = await pool.query('SELECT id FROM subscribers WHERE email = $1', [email]);
    if (check.rows.length > 0) {
      return res.send('Este e-mail já está inscrito em nossa lista.');
    }

    // 4. Inserção no Banco capturando o UUID gerado automaticamente
    const result = await pool.query(
      'INSERT INTO subscribers (email) VALUES ($1) RETURNING unsubscribe_token',
      [email]
    );
    const token = result.rows[0].unsubscribe_token;

    // 5. Configuração do Transporte de E-mail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // 6. Envio do E-mail de Boas-vindas
    const mailOptions = {
      from: `Dev Da Vez <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Bem-vindo à nossa Newsletter!',
      html: getNewsletterHtml({
        COMPANY_NAME: 'Dev Da Vez',
        LOGO_URL: 'https://devdavez.com.br/img/logo-dark.png',
        COMPANY_WEBSITE: 'https://www.devdavez.com.br',
        // O link utiliza a variável de ambiente BASE_URL configurada no deploy
        UNSUBSCRIBE_URL: `${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe?token=${token}`
      })
    };

    await transporter.sendMail(mailOptions);

    // 7. Resposta visual de sucesso estilizada
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: 'Segoe UI', sans-serif; color: #333; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 12px; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <div style="font-size: 50px; margin-bottom: 20px;">✉️</div>
          <h1 style="color: #2c3e50; margin-bottom: 10px;">Quase lá!</h1>
          <p style="font-size: 18px; color: #555;">Inscrição realizada para <strong>${email}</strong>.</p>
          <p style="color: #7f8c8d; margin-bottom: 30px;">Confira sua caixa de entrada para confirmar.</p>
          <a href="/" style="display: inline-block; padding: 12px 25px; background-color: #3498db; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Voltar ao Início</a>
        </div>
      </div>
    `);
  } catch (err) {
    console.error('Erro na inscrição:', err);
    res.status(500).send('Erro interno ao processar sua inscrição.');
  }
});

// Rota de Cancelamento: Utiliza o Token (UUID) para maior segurança e privacidade
app.get('/unsubscribe', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).send('Token de cancelamento ausente.');
  }

  try {
    // 1. Busca o e-mail associado ao token antes de deletar
    const user = await pool.query('SELECT email FROM subscribers WHERE unsubscribe_token = $1', [token]);

    if (user.rows.length === 0) {
      return res.send('Link inválido ou inscrição já removida.');
    }

    const email = user.rows[0].email;

    // 2. Remove o assinante do banco de dados
    await pool.query('DELETE FROM subscribers WHERE unsubscribe_token = $1', [token]);

    // 3. Envio de e-mail de confirmação de cancelamento
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Confirmação de Cancelamento - Dev Da Vez',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Inscrição cancelada</h2>
          <p>Sua remoção da nossa lista foi concluída com sucesso.</p>
          <p>Se mudar de ideia, as portas estarão sempre abertas!</p>
        </div>`
    });

    // 4. Feedback visual amigável de despedida
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: sans-serif; padding: 20px;">
        <h1 style="color: #444;">Sua inscrição foi cancelada.</h1>
        <p style="color: #666;">Enviamos uma confirmação para o seu e-mail.</p>
        <hr style="width: 50px; margin: 30px auto; border: 1px solid #ddd;">
        <p>Agradecemos pelo tempo que esteve conosco!</p>
        <p><a href="/" style="color: #3498db;">Voltar ao site</a></p>
      </div>
    `);
  } catch (err) {
    console.error('Erro no cancelamento:', err);
    res.status(500).send('Erro ao processar o cancelamento.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});