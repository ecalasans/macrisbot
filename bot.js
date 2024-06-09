// Bibliotecas necessárias
const env = require('./.env');
const {Telegraf} = require('telegraf');
const dialogflow = require('@google-cloud/dialogflow-cx');
const uuid = require('uuid');

const project_id = env.DF_PROJECT_ID;
const location = 'global';
const agent_id = env.DF_AGENT_ID;
const key_file = env.PATH_TO_DF_CREDENTIALS;

// Setup cliente Dialogflow
const session_client = new dialogflow.SessionsClient(
    {keyFilename: key_file}
);

const page_client = new dialogflow.PagesClient(
    {keyFilename: key_file}
);

const flows_client = new dialogflow.FlowsClient(
    {keyFilename: key_file}
)

// Inicializa o bot
const bot = new Telegraf(env.token);

// Objeto para armazenar as sessões
const sessions = {}

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
            parameters: {
                fields: parameters,
            },
        }
    }

    // Envia a requisição para o DF e aguarda a resposta
    const [responses] = await session_client.detectIntent(request);
    console.log(responses);

    // Retorna a resposta
    return responses.queryResult;

}

// Função assíncrona que captura os parâmetros
const getRequiredParameters = async (page_path) => {
    const page_client = new dialogflow.PagesClient(
        {keyFilename: key_file}
    );

    const [page] = await page_client.getPage({name: page_path});

    if(page.form){
        const required_parameters = page.form.parameters.filter(param => param.required);
        return required_parameters.map(param => param.displayName);
    }
    return
}

// Função assíncrona que retorna a página inicial
const getStartPage = async (flow_path) => {
    const [flow] = await flows_client.getFlow({name: flow_path})

    const start_page = flow.transitionRoutes[0].targetPage
        || flow.transitionRoutes[0].targetFlow
    console.log(start_page);
    return start_page;
}

// Interação do bot
bot.on(
    'text',
    async ctx => {
            const user_id = ctx.update.message.from.id.toString();

            // Cria o id de sessão
            let session_id;
            if (sessions[user_id]){
                session_id = sessions[user_id].session_id;
            } else {
                session_id = uuid.v4();
                sessions[user_id] = {
                    session_id,
                    data: {}
                };
            }

            // Captura o que foi digitado
            const query = ctx.update.message.text;

            //Captura a página ou seta para inicial
            const flow_path = `projects/${project_id}/locations/${location}/agents/${agent_id}/flows/00000000-0000-0000-0000-000000000000`;

            //  Captura a sessão atual
            const session_data = sessions[user_id].data;

            try {
                const start_page = await getStartPage(flow_path);
                const current_page = session_data.current_page || start_page;


                const required_params = await getRequiredParameters(current_page);
                console.log('Required parameters: ', typeof(required_params));
                const parameters = {}

                // Captura os parâmetros


                console.log('Required parameters:', required_params); // Logging required parameters
                console.log('Session:', session_data); // Logging session data

                // Manda para o DF e aguarda a resposta
                const response = await queryToMacris(query, session_id, parameters);
                //console.log('Dialogflow CX response:', JSON.stringify(response, null, 2));

            // Update session values
                session_data.current_page = response.currentPage.name;
                if (response.parameters && response.parameters.fields) {
                    Object.keys(response.parameters.fields).forEach(key => {
                        const value = response.parameters.fields[key];
                        session_data[key] = value.stringValue || value.structValue;
                    });
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