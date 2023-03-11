const languages = require( './languages' );
const defaultLang = "en";
const isMod = ( channelName, userstate ) => userstate.mod || "#" + userstate.username == channelName
const isHomeChannel = ( channelName, { botChannelName } ) => channelName == botChannelName


function runCommand( channel, userstate, message, app ) {
  const { prefixRegex, channels } = app
  const command = message.split( /\s/ )[ 0 ].replace( prefixRegex, '' ).toLowerCase()

  if( commands.hasOwnProperty( command ) ) {
    const commandRunner = commands[ command ]
    if( !authenticate( commandRunner, channel, userstate, app ) ) return
    commandRunner( app, channel, channels[ channel ], userstate, message )
  }
}

function authenticate( runner, channel, userstate, app ) {
  if( runner.modOnly && !isMod( channel, userstate ) ) return false
  if( runner.homeOnly && !isHomeChannel( channel, app ) ) return false
  return true
}

const commands = {}
const firstKeys = []
function add( keys, fn, opts = {} ) {
  keys.forEach( key => {
    key = key.toLowerCase()
    if( key in commands ) {
      throw new Error( `${ key } already exists in commands` )
    }
    commands[ key ] = Object.assign( fn, opts )
  } );
  firstKeys.push( Array.from( keys ).sort( ( a, b ) => a.length - b.length )[ 0 ] )
}

function usageMapper( key ) {
  const runner = commands[ key ]
  if( runner.usage ) key = `${ key } ${ runner.usage }`
  return '!' + key
}

add( [ "join" ],
  (
    { channels, store, client },
    channelName,
    _,
    { username, [ "display-name" ]: display },
    message
  ) => {
    const userChannel = "#" + username
    if( !channels[ userChannel ] ) {
      client.join( userChannel )
        .then( ( data ) => {
          const [ , lang = defaultLang ] = message.split( /\s+/ )
          channels[ data ] = {
            lang: lang,
            color: false,
            uncensored: false,
            langshow: false,
            pause: false,
            gpt: false,
            cooldown: 0,
            prompt: "You are a helpful assistant"
          };
          store.put( "channels", channels );
          client.say( userChannel, "/me Hello! I am ready to translate" );
          client.say( channelName, "/me Okay, " + display );
        } )
        .catch( e => {
          client.say( channelName, `@${ username } Something went wrong` );
          console.log( `Something went wrong when trying to join ${ username }'s channel: `, err );
        } );
    } else {
      client.say( channelName, "/me On my way :)" )
    }
  },
  {
    homeOnly: true,
    description: {
      en: 'join your channel'
    }
  }
)
add( [ "gptlang", ],
  ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
    const [ , targetLanguage = defaultLang ] = message.split( /\s+/ );
    if( languages.isSupported( targetLanguage ) ) {
      channelConfig.lang = languages.getCode( targetLanguage );
      store.put( "channels", channels );
      client.say( channelName, "/me I will now translate everything to " + languages[ channelConfig.lang ] );
    }
  },
  {
    modOnly: true, usage: '[language]',
    description: {
      en: 'update target language on channel'
    }
  }
)
add( [ "gptlist", ],
  ( { client }, channelName ) => {
    const supportedlanguages = Object.keys( languages ).filter( lang => lang != "auto" && lang != "isSupported" && lang != "getCode" ).join( ", " );
    client.say( channelName, "These are the languages i can translate: " + supportedlanguages );
  },
  {
    modOnly: true,
    description: {
      en: 'list available languages'
    }
  }
)
add( [ "gptcensor", ],
  ( { channels, store, client }, channelName, channelConfig ) => {
    channelConfig.uncensored = !channelConfig.uncensored;
    store.put( "channels", channels );
    client.say( channelName,
      channelConfig.uncensored
        ? "Bad-Words are now allowed."
        : "Bad-Words are no longer allowed."
    );
  },
  {
    modOnly: true,
    description: {
      en: 'toggle profanity censoring'
    }
  }
)
add( [ "gptleave" ],
  ( { channels, store, client }, channelName, channelConfig ) => {
    delete channelConfig;
    delete channels[ channelName ];
    store.put( "channels", channels );
    client.say( channelName, "Well since you dont want me here ill leave!!!" );
    client.part( channelName );
  },
  {
    modOnly: true,
    description: {
      en: 'leave current channel'
    }
  }
)
add( [ "gptcolor" ],
  ( { channels, store, client }, channelName, channelConfig ) => {
    channelConfig.color = !channelConfig.color;
    store.put( "channels", channels );
    const state = channelConfig.color ? "ENABLED" : "DISABLED"
    client.say( channelName, `Chat color was ${ state }` );
  },
  {
    modOnly: true,
    description: {
      en: 'toggle using /me'
    }
  }
)
add( [ "gpthelp" ],
  ( app, channelName, __, userstate, message ) => {
    const [ , command ] = message.split( /\s+/ )

    if( command && commands.hasOwnProperty( command ) ) {
      const runner = commands[ command ]

      if( authenticate( runner, channelName, userstate, app ) ) {
        app.client.say(
          channelName,
          `The command ${ command } is to ${ runner.description.en }. Usage: ${ usageMapper( command ) }`
        );
      } else {
        app.client.say(
          channelName,
          `The command ${ command } is not available to you`
        );
      }
    }
    else {
      let commandsList = firstKeys.sort()
        .filter( key => authenticate( commands[ key ], channelName, userstate, app ) )
        .map( usageMapper )
        .join( ', ' )

      app.client.say( channelName, "My commands are " + commandsList );
    }
  },
  {
    description: {
      en: 'provide help'
    }
  }
)
add( [ "gptshow" ],
  ( { channels, store, client }, channelName, channelConfig ) => {
    channelConfig.langshow = !channelConfig.langshow;
    store.put( "channels", channels );
    client.say( channelName,
      channelConfig.langshow
        ? "I will now show the language name."
        : "I will now only show the translated message."
    );
  },
  {
    modOnly: true,
    description: {
      en: 'toggle language tag'
    }
  }
)
add( [ "gptignore" ],
  ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
    var [ , username ] = message.split( /\s+/ );
    if( !username ) return;
    username = username.toLowerCase();
    if( !channelConfig.ignore ) { channelConfig.ignore = {} };
    if( channelConfig.ignore[ username ] ) {
      delete channelConfig.ignore[ username ];
      client.say( channelName,
        "I will no longer ignore " + username
      );
    }
    else {
      channelConfig.ignore[ username ] = true;
      client.say( channelName,
        "I will now ignore " + username
      );
    }
    store.put( "channels", channels );
  },
  {
    modOnly: true,
    description: {
      en: 'toggle ignore user'
    }
  }
)
add( [ "gptinfo" ],
  ( { client }, channelName ) => {
    client.say( channelName, "Modified chattranslator originally created by isntafluff modiefied by g3ars0fwar " );
  },
  {
    modOnly: true,
    description: {
      en: 'about myself'
    }
  }
)
add ( [ "langpause" ],
( { channels, store, client }, channelName, channelConfig ) => {
  channelConfig.pause = !channelConfig.pause;
  store.put( "channels", channels );
  const state = !channelConfig.pause ? "Unpaused" : "Paused"
  client.say( channelName, `Chat was ${ state }` );
    
  
},

{

modOnly: true,
description: {
  en: "Toggle pause on and off in mongoDatabase."
  }

 }
),

add ( [ "gptpause", ],
( { channels, store, client }, channelName, channelConfig ) => {
  channelConfig.gpt = !channelConfig.gpt;
  store.put( "channels", channels );
  const state = !channelConfig.gpt ? "Unpaused" : "Paused"
  client.say( channelName, `GPT is ${ state }` );

  },

{

  modOnly: true,
  description: {
    en: "Toggle pause on and off in mongoDatabase."
    }
  
   }
  ),

  add( [ "gptcooldown" ],
  ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
    const newNumber = parseInt(message.split(' ')[1] * 1000)
    console.log(newNumber)
    channelConfig.cooldown = newNumber;
    store.put( "channels", channels ); 
    client.say( channelName, 'GPT cooldown set to ' + newNumber/1000 /60 + ' minutes'  ) ;
    
    },
  
  {
  
    modOnly: true,
    description: {
      en: "Toggle pause on and off in mongoDatabase."
      }
    
     }
    ),


    add( [ "gpttrump" ],
    ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
      const prompt = "You are donald trump always reply in the tone of donald trump never break character"
      console.log(prompt)
      channelConfig.prompt = prompt;
      store.put( "channels", channels ); 
      client.say( channelName, 'GPT set to the Trump personality') ;
      
      },
    
    {
    
      modOnly: true,
      description: {
        en: "Toggle pause on and off in mongoDatabase."
        }
      
       }
      ),

      
    add( [ "gptangry" ],
    ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
      const prompt = "You are an angry person you will never break character and are extremely rude."
      console.log(prompt)
      channelConfig.prompt = prompt;
      store.put( "channels", channels ); 
      client.say( channelName, 'GPT set to the angry personality') ;
      
      },
    
    {
    
      modOnly: true,
      description: {
        en: "Toggle pause on and off in mongoDatabase."
        }
      
       }
      ),

      add( [ "gptsarcastic" ],
      ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
        const prompt = "You are a cynical person you will never break character and are extremely sarcastic."
        console.log(prompt)
        channelConfig.prompt = prompt;
        store.put( "channels", channels ); 
        client.say( channelName, 'GPT set to the sarcastic personality') ;
        
        },
      
      {
      
        modOnly: true,
        description: {
          en: "Toggle pause on and off in mongoDatabase."
          }
        
         }
        ),

        add( [ "gptmarcus" ],
        ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
          const prompt = "you are marcus pheonix from gears of war you will never break character and will mention your tomatoes quite often"
          console.log(prompt)
          channelConfig.prompt = prompt;
          store.put( "channels", channels ); 
          client.say( channelName, 'GPT set to the Marcus Pheonix personality') ;
          
          },
        
        {
        
          modOnly: true,
          description: {
            en: "Toggle pause on and off in mongoDatabase."
            }
          
           }
          ),

          add( [ "gptnormal" ],
          ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
            const prompt = "you are a helpful assistant with a bit of sas"
            console.log(prompt)
            channelConfig.prompt = prompt;
            store.put( "channels", channels ); 
            client.say( channelName, 'GPT set to the Normal personality') ;
            
            },
          
          {
          
            modOnly: true,
            description: {
              en: "Toggle pause on and off in mongoDatabase."
              }
            
             }
            ),



            add( [ "gptmrt" ],
            ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
              const prompt = "You will act like Mr.t you will always reply with his tone and never break character"
              console.log(prompt)
              channelConfig.prompt = prompt;
              store.put( "channels", channels ); 
              client.say( channelName, 'GPT set to the Mr.T personality') ;
              
              },
            
            {
            
              modOnly: true,
              description: {
                en: "Toggle pause on and off in mongoDatabase."
                }
              
               }
              ),
             
              add( [ "gptrs" ],
              ( { channels, store, client }, channelName, channelConfig, userstate, message ) => {
                const prompt = "You will act like a runescape character and will always reply with its persona you will never break character."
                console.log(prompt)
                channelConfig.prompt = prompt;
                store.put( "channels", channels ); 
                client.say( channelName, 'GPT set to a runescape characters POV personality') ;
                
                },
              
              {
              
                modOnly: true,
                description: {
                  en: "Toggle pause on and off in mongoDatabase."
                  }
                
                 }
                ),
              add( [ "gptpersonas" ],
              ( { client }, channelName ) => {
              client.say( channelName, "You can now change my personality available personalities are trump, angry, sarcastic, marcus, normal and mrt To change my personality type !gptpersonality IE !gptmarcus" );
            },
          {


           modOnly: true,
           description: {
           en: 'about myself'
    }
  }
)

module.exports = { runCommand, commands }








