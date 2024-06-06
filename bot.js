// Bibliotecas necessárias
const env = require('./.env');
const {Telegraf} = require('telegraf');
const dialogflow = require('@google-cloud/dialogflow-cx');
const uuid = require('uuid');

// Setup cliente Dialogflow
const session_client = new dialogflow.SessionsClient(
    {keyFilename: './mariacristina-03062024-686cd380ce3f.json'}
);

const page_client = new dialogflow.PagesClient(
    {keyFilename: './mariacristina-03062024-686cd380ce3f.json'}
);

const project_id = env.DF_PROJECT_ID;
const location = 'global';
const agent_id = env.DF_AGENT_ID;


// Inicializa o bot
const bot = new Telegraf(env.token);

//Função assíncrona que manda mensagem para o Dialogflow e recebe uma resposta
const queryToMacris = async (query, session_id, parameters = {}) => {
    // Objeto de sessão com o DF
    console.log(typeof(env.DF_PROJECT_ID));
    const session_path = session_client.projectLocationAgentSessionPath(
        project_id,
        location,
        agent_id,
        session_id
    )

    // Objeto de requisição ao DF - texto e parâmetros
    const request = {
        session: session_path,
        queryInput: {
            text: {
                text: query
            },
            languageCode: 'pt-BR'
        },
        queryParams: {
            parameters: parameters,
        }
    }

    // Envia a requisição para o DF e aguarda a resposta
    const responses = await session_client.detectIntent(request);
    //console.log(responses);

    // Retorna a resposta
    return responses[0].queryResult;

}

// Função assíncrona para capturar detalhes da página
const getPageDetails = async (flow_id, page_id) => {
    const page_path = page_client.pagePath(project_id, location, agent_id, flow_id, page_id);
    //const page_path = `projects/${project_id}/locations/${location}/agents/${agent_id}/` +
        //`flows/${flow_id}/pages/${page_id}`;

    const [page] = await page_client.getPage({name: page_path});
    return page;
}

// Armazena parâmetros da sessão
const session_parameters = {}

// Interação do bot
bot.on(
    'text',
    async ctx => {
        // Cria o id de sessão
        const session_id = ctx.update.message.from.id.toString();

        // Captura o que foi digitado
        const query = ctx.update.message.text;
        console.log(`User query: ${query}`);

        // Se não existir o parâmetro, cria com ele vazio
        if(!session_parameters[session_id]){
            session_parameters[session_id] = {}
        }

        try {
            // Manda para o DF e aguarda a resposta
            const response = await queryToMacris(query, session_id, session_parameters[session_id]);
            console.log('Dialogflow CX response:', JSON.stringify(response, null, 2));

            // Extract the flow ID and page ID from the response
            const currentPage = response.currentPage.name;
            const pathComponents = currentPage.split('/');
            const flow_id = pathComponents[pathComponents.indexOf('flows') + 1];
            const page_id = pathComponents[pathComponents.indexOf('pages') + 1];

            console.log('Flow ID:', flow_id);
            console.log('Page ID:', page_id);

            //Pega detalhes da página
            const page_details = await getPageDetails(flow_id, page_id);

            // Extrai os parâmetros requeridos
            if(page_details.form && page_details.form.parameters > 0){
                const required_parameters = page_details.form.parameters
                    .filter(parameter => parameter.required)
                    .map(parameter => parameter.displayName);
            }

            // Atualiza os parâmetros
            for(let param of required_parameters){
                if(response.parameters.fields[param]){
                    session_parameters[session_id][param] = response.parameters.fields[param];
                }
            }

            if (requiredParameters.length > 0) {
                ctx.reply(`Required parameters for the current page: ${requiredParameters.join(', ')}`);
            } else {
                ctx.reply('No required parameters for the current page.');
            }

            if (response.responseMessages && response.responseMessages.length > 0) {
                response.responseMessages.forEach(
                    (msg) => {
                        if (msg.text && msg.text.text){
                            const reply_msg =  msg.text.text[0]
                            console.log(`Replying with: ${reply_msg}`);
                            ctx.reply(reply_msg);
                        } else {
                            console.log('Received a response message with no text.');
                        }
                    }
                );
                console.log('Current page:', response.currentPage?.displayName);

            } else {
                console.log('No response messages found');
                ctx.reply('I didn’t understand that. Can you try rephrasing?');
            }

            // Manda a resposta para o chat
            //ctx.reply(response.responseMessages[0].text.text[0]);

        } catch (e) {
            console.error('Dialogflow CX error: ', e.message);
            ctx.reply('Deu merda...');
        }


    }
)

bot.launch();