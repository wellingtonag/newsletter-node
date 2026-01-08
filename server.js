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
    .replace(/'.UNSUBSCRIBE_URL.'/g, vars.UNSUBSCRIBE_URL) // O link agora usará o token
    .replace(/'.date\('Y'\).'|{{YEAR}}/g, new Date().getFullYear());
  return html;
}

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para inscrição (Modificada para capturar o token gerado)
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

    // O RETURNING unsubscribe_token nos dá o ID único criado pelo banco
    const result = await pool.query(
      'INSERT INTO subscribers (email) VALUES ($1) RETURNING unsubscribe_token',
      [email]
    );
    const token = result.rows[0].unsubscribe_token;

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
        UNSUBSCRIBE_URL: `${process.env.BASE_URL || 'http://localhost:3000'}/unsubscribe?token=${token}`
      })
    };

    await transporter.sendMail(mailOptions);

    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 12px; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <div style="font-size: 50px; margin-bottom: 20px;">✉️</div>
          <h1 style="color: #2c3e50; margin-bottom: 10px;">Quase lá!</h1>
          <p style="font-size: 18px; line-height: 1.6; color: #555;">
            Sua inscrição foi realizada com <strong>sucesso</strong>.
          </p>
          <p style="font-size: 16px; color: #7f8c8d; margin-bottom: 30px;">
            Enviamos um e-mail de boas-vindas para <strong>${email}</strong>.<br> 
            Confira sua caixa de entrada (e a de spam, só por garantia).
          </p>
          <a href="/" style="display: inline-block; padding: 12px 25px; background-color: #3498db; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; transition: background-color 0.3s;">
            Voltar ao Início
          </a>
          <p style="margin-top: 30px; font-size: 14px; color: #bdc3c7;">
            Obrigado por se juntar à comunidade <strong>Dev Da Vez</strong>!
          </p>
        </div>
      </div>
    `);
  } catch (err) {
    console.error(err);
    res.send('Erro ao processar inscrição.');
  }
});

// NOVA ROTA: Cancelamento de Inscrição
app.get('/unsubscribe', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).send('Token de cancelamento ausente.');
  }

  try {
    // Busca o e-mail antes de deletar para poder enviar a confirmação
    const user = await pool.query('SELECT email FROM subscribers WHERE unsubscribe_token = $1', [token]);

    if (user.rows.length === 0) {
      return res.send('Vínculo não encontrado ou já removido.');
    }

    const email = user.rows[0].email;

    // Remove do banco de dados
    await pool.query('DELETE FROM subscribers WHERE unsubscribe_token = $1', [token]);

    // Envia e-mail de despedida (Confirmação de cancelamento)
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
      subject: 'Confirmação de Cancelamento',
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Inscrição cancelada com sucesso</h2>
          <p>Olá, este e-mail confirma que você não receberá mais nossa newsletter.</p>
          <p>Sentiremos sua falta! Se mudar de ideia, poderá se inscrever novamente em nosso site quando quiser.</p>
          <br>
          <p>Atenciosamente, <br>Equipe Dev Da Vez</p>
        </div>`
    });

    // Mensagem educada na tela do navegador
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: sans-serif; padding: 20px;">
        <h1 style="color: #444;">Sua inscrição foi cancelada com sucesso.</h1>
        <p style="font-size: 1.1em; color: #666;">Você receberá um e-mail de confirmação em instantes.</p>
        <hr style="width: 50px; margin: 30px auto; border: 1px solid #ddd;">
        <p>Agradecemos muito pelo tempo que esteve conosco!</p>
        <p>Saiba que você poderá assinar nossa newsletter novamente a qualquer momento que desejar.</p>
      </div>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro interno ao processar cancelamento.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});