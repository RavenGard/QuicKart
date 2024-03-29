//connects the database to the server
const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ObjectID } = require('mongodb');

const graph = require('../routing/graph');
const dijkstra = require('../routing/dijkstra');

const dotenv = require('dotenv');
const Db = require('mongodb/lib/db');
const { assertValidSDLExtension } = require('graphql/validation/validate');
const astar = require('../routing/astar');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();
const { DB_URI, DB_NAME, JWT_SECRET} = process.env;

const getToken = (user) => jwt.sign({id: user._id}, JWT_SECRET, {expiresIn: '10 days'});

const getUserFromToken = async(token, db) =>{

  if(!token){return null}

  const tokenData = jwt.verify(token, JWT_SECRET);
 
  if(!tokenData?.id){
    return null;
  }

  return await db.collection('Users').findOne({_id: ObjectID(tokenData.id)});
}

//defining the different types in the schema
const typeDefs = gql`


    type Query {
      #creating an arrays of items
      items:[Item!]!

      #gets a specific item by its ID

      getItem (id:ID!):Item

      getInventory (id: Int!): [Item]!

      getAisle (id:ID!): Aisle

      getMap(id: ID!): StoreMap

      getMapElements(id: ID!): [[Int]]  #TESTING PURPOSES ONLY
    }

    type Mutation {
      signUp(input: SignUpInput): AuthUser!
      signIn(input: SignInInput): AuthUser!
      createInventory(id: Int!, title: String!): Inventory!

      #creates an item
      createItem(name: String!,aisle:String!,bay:String!,price:Float!,xVal:Int!,yVal:Int!): Item!
      deleteItem(id: ID!):Boolean!

      createAisle(
        number: Int!
        name: String!, 
        xStartVal: Int!, 
        xEndVal: Int!, 
        yStartVal: Int!,
        yEndVal: Int!
      ): Aisle!

      createCheckout(
        lane: Int!,
        xStartVal:Int!,
        xEndVal:Int!,
        yStartVal:Int!,
        yEndVal:Int!
      ): Checkout!

      createDoor(
        name: String!,
        xStartVal:Int!,
        xEndVal:Int!,
        yStartVal:Int!,
        yEndVal:Int!
      ): Door!

      createMap(title: String!, description: String!, width: Int!, length: Int!): StoreMap!
    }
    
    input SignUpInput{
      email: String!
      password: String!
      name: String!
      
    }

    input SignInInput{
      email: String!
      password: String!
    }

    type AuthUser{
      user: User!
      token: String!
    }

    type User{
      id: ID!
      name: String!
      email: String!
    }
    
    #defining what a item is in our database
    type Item{
      id:ID!,
      name:String!,
      aisle:String!,
      bay:String!,
      price:Float!,
      xVal:Int!,
      yVal:Int!
    }

    type Aisle{
      id: ID!,
      number: Int!,
      name:String!,
      bays:[[Int]!]!,
      xStartVal:Int!,
      xEndVal:Int!,
      yStartVal:Int!,
      yEndVal:Int!
    }

    type StoreMap {
      id: ID!,
      title: String!
      description: String,
      aisle: [Aisle!]!,
      checkout: [Checkout!]!
      width: Int!,
      length: Int!
      entrance: [Door!]!
    }

    type Checkout {
      lane: Int!,
      xStartVal:Int!,
      xEndVal:Int!,
      yStartVal:Int!,
      yEndVal:Int!
    }

    type Door {
      name: String!,
      xStartVal:Int!,
      xEndVal:Int!,
      yStartVal:Int!,
      yEndVal:Int!
    }
    
    type Inventory {
      id: Int!
      title: String!
      items: [Item]!
    }
`;




//
const resolvers = {
  Query:  {
    getInventory: async (_, { id }, { db }) => {
      const inventory =  await db.collection('Inventory').findOne( {id: id });
      const items = inventory.items;
      return items
    },

    // created this area to create an item and save it to the database
    getItem: async (_, { id }, { db }) => {
      return await db.collection('Item').findOne({ _id: ObjectID(id) });
    },

     
  

    getAisle: async(_, { id }, { db }) => {
      return await db.collection('Aisles').findOne({ _id: ObjectID(id) });
    },

    getMap: async (_, { id }, { db }) => {
      return await db.collection('Map').findOne({ _id: ObjectID(id) });
    },
  
      // Testing output for Dijkstra algorithm
      // Delete after testing
    getMapElements: async (_, { id }, { db}) => {
      const map = await db.collection('Map').findOne({ _id: ObjectID(id) })
      if(!map) {
          throw new Error('Map not found');
      }
      console.log(graph(map))
      const source = { x: 15, y: 15 }
      const destination = { x: 0, y: 0 }
      const shortestPath = dijkstra(graph(map), source, destination);

      let count = 1;
      shortestPath.forEach(node => {
        console.log(`Step ${count} → (${node.x},${node.y})`)
        count++;
      });

      
      // const start = { x: 27, y: 27 }
      // const end = { x: 25, y: 15 }
      // const shortestPath2 = astar(graph(map), start, end);

      // // Testing output for A* Search
      // let count2 = 1;
      // shortestPath2.forEach(node => {
      //   console.log(`Step ${count2} -> (${node.x},${node.y})`)
      //   count2++;
      // });
      
    }

  },

  Mutation: {
     signUp: async (_, { input }, { db, }) => {
   const hashedPassword = bcrypt.hashSync(input.password);
   const newUser = {
    ...input,
    password: hashedPassword,
   }

   //save to database
   const result = await db.collection('Users').insert(newUser);
   const user = result.ops[0]
   
   return{
    user, 
    token: getToken(user),
     }
    },

    signIn: async(_, {input}, {db}) => {
      const user = await db.collection('Users').findOne({email: input.email});
      const isPasswordCorrect = user && bcrypt.compareSync(input.password, user?.password);

      if(!user || !isPasswordCorrect){
        throw new Error('Invalid credentials!');
      }

      
   
      return{
        user,
        token: getToken(user),
      }
    },

    createInventory: async(_, { title, id }, { db }) => {
      const currItems = await db.collection('Item').find().toArray();
      const newInventory = {
        id: id,
        title: title,
        items: currItems
      }

      const result = await db.collection('Inventory').insert(newInventory);

      return result.ops[0]
    },

    //created this area to create an item and save it to the database
    createItem:async(_, {name, aisle, bay, price, xVal, yVal},{db}) => {

      //what is need for the item to be created and what time it was created at
      const newItem = {name, aisle, bay, price, xVal, yVal, createdAt: new Date().toISOString()
      }
      
      const result = await db.collection('Item').insert(newItem);
      return result.ops[0];
      },

      deleteItem: async(_, {id}, {db}) => {
  
        //TODO only collaboratrs of this task should be able to deltete
        await db.collection('Item').removeOne({_id: ObjectID(id) }); 
  
        return true;
        },

    createAisle: async(_, { number, name, xStartVal, xEndVal, yStartVal, yEndVal }, { db }) => {

      const width = (xEndVal - xStartVal) + 1;
      const length = (yEndVal - yStartVal) + 1;

      // bays are not unique identifiers like aisles
      // three bays per aisle
      const horizonBayLength = width/3; 
      const vertBayLength = length/3;

      // 1st bay starts = startVal
      // 1st bay ends = starts + (bay length - 1)
      const bayCoordinates = [];
      if( width > length ) {
        for(let i = 0; i <= width; i++) {
          if (i == horizonBayLength) {

            const horizonFirstBayEnd = xStartVal + (i - 1);
            bayCoordinates.push([xStartVal,horizonFirstBayEnd]);

          } else if (i == (horizonBayLength*2)) {
            
            const horizonSecondBay = xStartVal + (horizonBayLength);
            const horizonSecondBayEnd = xStartVal + (i - 1);
            bayCoordinates.push([horizonSecondBay,horizonSecondBayEnd]);

          } else if (i == (horizonBayLength*3)) {

            const horizonThirdBay = xStartVal + (horizonBayLength*2);
            const horizonThirdBayEnd = xEndVal;
            bayCoordinates.push([horizonThirdBay,horizonThirdBayEnd]);

          }
        }
      } else {

        for(let i = 0; i <= length; i++) {
          if (i == vertBayLength) {

            const vertFirstBayEnd = yStartVal + (i - 1);
            bayCoordinates.push([yStartVal,vertFirstBayEnd]);

          } else if (i == (vertBayLength*2)) {
            
            const vertSecondBay = yStartVal + (vertBayLength);
            const vertSecondBayEnd = yStartVal + (i - 1);
            bayCoordinates.push([vertSecondBay,vertSecondBayEnd]);

          } else if (i == (vertBayLength*3)) {

            const vertThirdBay = yStartVal + (vertBayLength*2);
            const vertThirdBayEnd = yEndVal;
            bayCoordinates.push([vertThirdBay,vertThirdBayEnd]);
            
          }
        }
      }

      const newAisle = {
        number,
        name,
        bays: bayCoordinates,
        xStartVal,
        xEndVal,
        yStartVal,
        yEndVal
      }

      // insert newAisle object into database
      const result = await db.collection('Aisles').insert(newAisle);
      return result.ops[0];
  },

  createMap: async (_, { title, description, width, length }, { db }) => { 

    if(await db.collection('Map').findOne({ title: title })) { throw new Error('Map already exists') }

    if(!(width > 0 && length > 0)) { throw new Error('Invalid map dimensions. Must have an area of at least 1 unit') }

    const aisles = await db.collection('Aisles').find().toArray();
    const checkoutLanes = await db.collection('Checkout').find().toArray();
    const entrances = await db.collection('Doors').find().toArray();

    const validateRange = (x, y, min, max) => {
      return x >= min && y <= max
    }

    const validateObject = (obj, objName) => {
      obj.forEach( (element) => {
        if(!(validateRange(element.xStartVal, element.xEndVal, 0, width)
          && validateRange(element.yStartVal, element.yEndVal, 0, length))) { 
            throw new Error(`${objName} dimensions exceed map dimensions`)
        }
        
      });
    }

    validateObject(aisles, "Aisle")
    validateObject(checkoutLanes, "Checkout lane")
    validateObject(entrances, "Entrance")
    
    const newMap = {
      title,
      description,
      width,
      length,
      aisle: aisles,
      checkout: checkoutLanes,
      entrance: entrances
    }
    
    const result = await db.collection('Map').insert(newMap);

    return result.ops[0]
  },
  
  createCheckout: async(_, { lane, xStartVal, xEndVal, yStartVal, yEndVal } , { db }) => {
    const newLane = {
      lane,
      xStartVal,
      xEndVal,
      yStartVal,
      yEndVal
    }
    
    const result = await db.collection('Checkout').insert(newLane);

    return result.ops[0]
  },

  createDoor: async(_, { name, xStartVal, xEndVal, yStartVal, yEndVal } , { db }) => {
    const newDoor = {
      name,
      xStartVal,
      xEndVal,
      yStartVal,
      yEndVal
    }
    
    const result = await db.collection('Doors').insert(newDoor);

    return result.ops[0]
  },

  },

   // did this so then Aisle.id in Apollo wouldn't give an error for non-nullable fields
  Aisle: {
    id: ({ _id, id }) => _id || id,  
  },

  User: {
    id: ( { _id, id }) => _id || id,
   },

  //Error for non-nullable fields
  Item: {
    id: ({ _id, id }) => _id || id,  
  },
  
  StoreMap: {
    id: ({ _id, id }) => _id || id,
  },
  Item:{
    id: ( { _id, id }) => _id || id,
    },
};
      
  
    




const start = async () => {
  const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DB_NAME); // defines the database
  //we wait to connect the sever untill  we connect to the database we will start the server
  //we need a connection to the server in order to have access to the data

  
  const server = new ApolloServer({
      typeDefs,
      resolvers,
      context: async({ req }) => {
        const user = await getUserFromToken(req.headers.authorization, db);
        
    
        return{
          db, 
          user,
        }
    
       },
      introspection: true
  }); 
  
  // The `listen` method launches a web server.
  server.listen().then(({ url }) => {
      console.log(`🚀  Server ready at ${url + 'quickkart'}`);
  });
}

start();