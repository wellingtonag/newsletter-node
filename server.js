require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexão com o Neon (PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

// Função para montar o HTML da newsletter
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

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para inscrição
app.post('/subscribe', async (req, res) => {
  const email = req.body.email;
  if (!email || !email.includes('@')) {
    return res.send('E-mail inválido.');
  }

  try {
    // Verifica se já está inscrito
    const check = await pool.query('SELECT id FROM subscribers WHERE email = $1', [email]);
    if (check.rows.length > 0) {
      return res.send('Este e-mail já está inscrito.');
    }

    // Insere no banco
    await pool.query('INSERT INTO subscribers (email) VALUES ($1)', [email]);

    // Envia e-mail de boas-vindas com HTML
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Bem-vindo à nossa Newsletter!',
      html: getNewsletterHtml({
        COMPANY_NAME: 'Dev Da vez',
        LOGO_URL: 'https://devdavez.com.br/img/logo-dark.png',
        COMPANY_WEBSITE: 'https://www.devdavez.com.br',
        UNSUBSCRIBE_URL: 'https://www.devdavez.com.br/unsubscribe?email=' + encodeURIComponent(email)
      })
    };

    await transporter.sendMail(mailOptions);

    res.send('Inscrição realizada com sucesso! Verifique seu e-mail.');
  } catch (err) {
    console.error(err);
    res.send('Erro ao processar inscrição.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});