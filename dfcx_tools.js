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
);

// Função assíncrona para detectar intents
const detectIntent = async (project_id, location, agent_id, session_id, msg, parameters = {}) => {
    const session_path = session_client.projectLocationAgentSessionPath(
        project_id, location, agent_id, session_id
    );

    const query_input = {
        session: session_path,
        queryInput: {
            text: {
                msg
            },
            languageCode: 'pt-BR'
        }
    }

    if (Object.keys(parameters).length > 0) {
        console.log(parameters.toJSON());
        query_input.parameters = parameters;
    }

    const [response] = await session_client.detectIntent(request);
    return response;
}

module.exports = {
    detectIntent
}