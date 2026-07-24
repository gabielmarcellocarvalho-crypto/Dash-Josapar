# **BRIEFING EVOLUÇÃO DO DASHBOARD LOOKER STUDIO — JOSAPAR**

---

**Precisamos transformar o Looker em nossa central única de dados, incluindo mídia, social e criativos visuais, com análise por marca e redução máxima de trabalho manual.**

## **OBJETIVO**

Evoluir o dashboard atual para se tornar a **fonte única de dados do relatório mensal**, contemplando:

* Mídia paga  
* Social media  
* Criativos (com visual / thumbnails)  
* Análise por marca  
* Redução máxima de planilhas manuais

---

## **ESCOPO — MARCAS**

Criar estrutura dedicada para:

* Josapar Institucional  
* Tio João  
* SupraSoy  
* Armazém Tio João (E-commerce)  
* Nova Oliva  
* Meu Biju

---

# **1\. ESTRUTURA DO DASHBOARD**

---

## **🔵 1.1 PÁGINA INICIAL — VISÃO EXECUTIVA**

### **Objetivo:**

Visão consolidada para diretoria

### **KPIs:**

* Investimento total  
* Impressões  
* Alcance  
* Cliques  
* CTR  
* CPC  
* Conversões  
* Receita  
* ROAS  
* Crescimento de seguidores

### **Visual:**

* Cards de KPI  
* Evolução temporal  
* Comparativo mês atual vs anterior

---

# **2\. ESTRUTURA POR MARCA (OBRIGATÓRIO)**

👉 Criar **1 aba por marca**, com padrão replicável, cores de cada marca.

---

# **3\. ESTRUTURA INTERNA DE CADA MARCA**

---

## **🔹 3.1 PERFORMANCE DE MÍDIA**

### **Métricas:**

* Investimento  
* Impressões  
* Cliques  
* CTR  
* CPC  
* Conversões  
* CPA  
* Receita  
* ROAS

### **Visual:**

* Série temporal  
* Comparação mensal  
* Breakdown por campanha

---

## **🔹 3.2 ANÁLISE DE CAMPANHAS**

### **Objetivo:**

Identificar desempenho individual

### **Deve permitir:**

* Ranking de campanhas  
* Filtro por objetivo

### **Tabela:**

* Nome da campanha  
* CTR  
* CPC  
* Conversões  
* ROAS

---

# **3.3 SOCIAL MEDIA (PRIORIDADE ALTA)**

---

## **⚠️ LIMITAÇÃO IMPORTANTE**

👉 Looker Studio **NÃO possui integração nativa com redes sociais orgânicas**

---

## **SOLUÇÃO**

Utilizar conectores:

* Supermetrics (recomendado)  
* Windsor.ai  
* Funnel.io

---

## **MÉTRICAS NECESSÁRIAS**

* Seguidores totais  
* Crescimento (%)  
* Alcance  
* Impressões  
* Engajamento  
* Taxa de engajamento  
* % não seguidores  
* Cliques

---

## **VISUAIS**

* Crescimento de seguidores (linha)  
* Alcance vs engajamento  
* Engajamento por formato (Reels, Feed, Stories)  
* Evolução mensal

---

# **3.4 CRIATIVOS (DIFERENCIAL CRÍTICO)**

👉 Essa seção é obrigatória para aumentar valor percebido do dashboard

---

## **OBJETIVO**

Permitir visualização dos **criativos e posts vencedores**, sem necessidade de análise manual externa.

---

## **⚠️ LIMITAÇÃO**

Looker Studio **não puxa imagens automaticamente sem URL estruturada**

---

## **SOLUÇÕES VIÁVEIS**

---

### **🟢 OPÇÃO 1 — CONECTOR (RECOMENDADO)**

Via Supermetrics / Windsor:

Para Meta Ads:

* Ad name  
* Métricas  
* **Image URL (thumbnail do criativo)**

Para Instagram:

* Post  
* Engajamento  
* **Thumbnail do post**

---

### **🟡 OPÇÃO 2 — PLANILHA DE APOIO**

Criar base manual com:

Marca | Nome do Criativo | URL Imagem | Métrica Principal | Tipo (Ad/Post)  
---

## **IMPLEMENTAÇÃO NO LOOKER**

### **Campo:**

* Tipo → Image (URL)

---

## **VISUAL IDEAL**

### **🔥 Tabela de Criativos**

* Imagem do criativo  
* Nome  
* CTR / Engajamento  
* Ranking

---

## **SEÇÕES**

### **1\. Top Criativos (Ads)**

* Top 5 por CTR  
* Top 5 por conversão

### **2\. Top Posts (Social)**

* Top 5 por alcance  
* Top 5 por engajamento

---

## **DIFERENCIAL**

👉 Permite que a diretoria:

* veja o que performou  
* entenda visualmente  
* conecte estratégia com execução

---

# **3.5 REGIONAL**

---

## **Métricas:**

* Performance por região  
* Crescimento por região  
* Alcance

---

## **Visual:**

* Mapa do Brasil  
* Ranking regional

---

# **4\. FUNCIONALIDADES ESSENCIAIS**

---

## **🔁 FILTROS**

* Período  
* Marca  
* Plataforma  
* Tipo (mídia / social)

---

## **📊 COMPARAÇÃO**

* Mês atual vs anterior  
* Variação (%) automática

---

## **🚨 INDICADORES VISUAIS**

* ↑ crescimento  
* ↓ queda  
* cores:  
  * verde (positivo)  
  * vermelho (negativo)

---

# **5\. INTEGRAÇÃO COM RELATÓRIO**

---

## **Objetivo:**

Permitir que o time:

* use o dashboard como fonte única  
* tire prints direto  
* embed no relatório

---

## **Uso:**

* Embed via iFrame  
* Print para Gamma  
* Navegação ao vivo na reunião

---

# **6\. RESULTADO ESPERADO**

---

## **Operacional:**

* Redução de 70–80% do trabalho manual  
* Eliminação de planilhas intermediárias

---

## **Estratégico:**

* Mais tempo para análise  
* Melhor qualidade de insights  
* Maior clareza para diretoria

---

# **7\. PRIORIDADE DE IMPLEMENTAÇÃO**

---

## **FASE 1 (CRÍTICO)**

* Estrutura por marca  
* KPIs mídia  
* Social básico

---

## **FASE 2**

* Criativos com imagem  
* Top posts

---

## **FASE 3**

* Regional  
* Comparações avançadas

---

