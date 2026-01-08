# 🚀 Dev Da Vez - Newsletter System
Sistema de gerenciamento de newsletter desenvolvido com Node.js, Express e PostgreSQL (Neon). Este projeto oferece uma solução completa para inscrição de usuários, armazenamento seguro e cancelamento de inscrição automatizado.

## 🛠️ Tecnologias Utilizadas
Node.js: Ambiente de execução para o servidor.

Express: Framework web para criação das rotas (Inscrição, Home e Unsubscribe).

PostgreSQL (Neon): Banco de dados relacional para armazenamento dos assinantes.

Nodemailer: Módulo para envio de e-mails de confirmação e boas-vindas.

UUID: Identificadores únicos para cancelamento de inscrição seguro.

## 📋 Funcionalidades Principais
Inscrição Segura: Os usuários podem se inscrever através de um formulário web simples.

E-mail de Boas-vindas: Envio automático de e-mail estilizado confirmando a assinatura.

Cancelamento por Token (UUID): Sistema de desinscrição seguro que não expõe o e-mail do usuário na URL.

Confirmação de Saída: Envio automático de e-mail confirmando que o usuário foi removido da lista.
