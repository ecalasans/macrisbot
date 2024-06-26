// Bibliotecas necessárias
const env = require('./.env');
const {Telegraf} = require('telegraf');
const dialogflow = require('@google-cloud/dialogflow-cx');
const uuid = require('uuid');
const {message} = require('telegraf/filters');

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
    //console.log(responses);

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

// Função assíncrona que captura o flow_id
const getCurrentFlowId = (response) => {
    const current_page_path = response.currentPage.name;
    const flow_id = current_page_path.split('/').slice(-3, -2)[0];
    return flow_id;
}

// Função para tratar custom payloads
const handleCustomPayloads = (payload, ctx) => {
    //console.log('Custom Payload:', JSON.stringify(payload, null, 2));

    // Se tiver um richContent
    if(payload.fields && payload.fields.richContent){
        const rich_content = payload.fields.richContent.listValue.values;
        rich_content.forEach(content_item => {
                const content_array = content_item.listValue.values;
                content_array.forEach(item => {
                        const item_struct = item.structValue.fields;
                        if(item_struct.type && item_struct.type.stringValue === 'chips' && item_struct.options){
                            const options = item_struct.options.listValue.values.map(option => {
                                    const option_text = option.structValue.fields.text.stringValue;
                                    return {
                                        text: option_text,
                                        callback_data: option_text
                                    }
                                }
                            );
                            ctx.reply('Opções:',
                                {
                                    reply_markup:{
                                        inline_keyboard: [options]
                                    }
                                }
                            )
                        }
                    }
                );
            }
        );
    }
}

// Função assíncrona para lidar com as callbacks
const handleCallbackQuery = async (ctx) => {
    const user_id = ctx.from.id.toString();
    const session_id = sessions[user_id]?.session_id;
    const data = ctx.callbackQuery.data;

    // Se não tiver em uma sessão encerra a função
    if(!session_id){
        ctx.reply('No session found.');
        return
    }

    try {
        // Parâmetros selecionados
        const parameters = {
            selectedOption : {
                stringValue: data,
                kind: 'stringValue'
            }
        }

        const response = await queryToMacris(data, session_id, parameters);

        if (response.responseMessages && response.responseMessages.length > 0){
            response.responseMessages.forEach(msg => {
                    if(msg.text && msg.text.text) {
                        const reply_msg = msg.text.text[0];
                        ctx.reply(reply_msg);
                    } else if(msg.payload) {
                        handleCustomPayloads(msg.payload, ctx);
                    }
                }
            );
        } else {
            ctx.reply('Sem resposta para este parâmetero');
        }
    } catch(e) {
        console.error('Erro do Dialogflow CX: ',e.message);
        ctx.reply('Deu merda na função handleCallbackQuery');
    }
}



bot.start(
    async ctx => {
        ctx.reply('Grupo Pequenos Passos - Setor de Inovação e Tecnologia')
    }
)

// Interação do bot
bot.on(
    message('text'),
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

            // Captura o flow Id
            let flow_id = '00000000-0000-0000-0000-000000000000'; // Default flow ID
            if (sessions[user_id].data.current_flow) {
                flow_id = sessions[user_id].data.current_flow;
            }

            //Captura a página ou seta para inicial
            //const flow_path = `projects/${project_id}/locations/${location}/agents/${agent_id}/flows/00000000-0000-0000-0000-000000000000`;
            const flow_path = `projects/${project_id}/locations/${location}/agents/${agent_id}/flows/${flow_id}`;


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
                session_data.current_flow = getCurrentFlowId(response);

                if (response.parameters && response.parameters.fields) {
                    Object.keys(response.parameters.fields).forEach(key => {
                        const value = response.parameters.fields[key];
                        session_data[key] = value.stringValue || value.structValue;
                    });
                }

                if (response.responseMessages && response.responseMessages.length > 0) {
                    for(const msg of response.responseMessages) {
                        if (msg.text && msg.text.text) {
                            const reply_msg = msg.text.text[0]
                            console.log(`Replying with: ${reply_msg}`);
                            await ctx.reply(reply_msg)
                        } else if (msg.payload){
                            await handleCustomPayloads(msg.payload, ctx);
                            console.log(msg.payload);
                        } else {
                            console.log('Received a response message with no text.');
                        }
                    }
                    console.log('Current page:', response.currentPage?.displayName);
                } else {
                    console.log('No response messages found');
                    ctx.reply('I didn’t understand that. Can you try rephrasing?');
                }
            } catch (e) {
                console.error('Dialogflow CX error: ', e.message);
                ctx.reply('Deu merda...');
            }
        }
)

bot.on('callback_query', handleCallbackQuery);

bot.launch();


