const { ObjectId } = require('mongodb');
const mysql = require('mysql2/promise');
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_DBNAME || 'gemm',
    user: process.env.DB_USER || 'fred',
    password: process.env.DB_PASSWORD,
    connectionLimit: 5,
    timezone: '+08:00',
    ssl: {
        ca: fs.readFileSync(__dirname + '/certs/ca-certificate.crt')
    }
});

const MYSQL_AUTHENTICATE = 'select user_id, profile_name, country from users where user_id=? and password=SHA1(?)';
const MYSQL_GETUSER = 'select * from users where user_id=?';
const MYSQL_GETUSERFOLLOWERS = 'select user_id from follow where follow_id=?';
const MYSQL_GETUSERFOLLOWING = 'select follow_id from follow where user_id=?';
const MYSQL_FOLLOWUSER = 'insert into follow(user_id, follow_id) values (?,?)';
const MYSQL_UNFOLLOWUSER = 'delete from follow where user_id=? and follow_id=?';

const makeQuery = (pool, query) => {
    return async (params) => {
        let conn;
        let error = false;
        try{
            conn = await pool.getConnection();
            const [result, _] = await conn.query(query, params);
            return result;
        }
        catch(err) {
            error = true;
            console.log(err);
        }
        finally{
            if(!error) {
                conn.release();
            }
        }
    };
}
const authenticateUser = makeQuery(pool, MYSQL_AUTHENTICATE);
const getUserQuery = makeQuery(pool, MYSQL_GETUSER);
const getUserFollowers = makeQuery(pool, MYSQL_GETUSERFOLLOWERS);
const getUserFollowing = makeQuery(pool, MYSQL_GETUSERFOLLOWING);
const setNewFollower = makeQuery(pool, MYSQL_FOLLOWUSER);
const unfollowUser = makeQuery(pool, MYSQL_UNFOLLOWUSER)

const MONGO_DB = process.env.MONGODBNAME || 'gemm';
const MONGO_COLLECTION = process.env.MONGOCOLLECTION || 'posts';
const MONGODB_PASSWORD = process.env.MONGODB_PASSWORD;
const MONGODB_USER = process.env.MONGODB_USER;
const mongoURL = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASSWORD}@paf-cluster.ajnfk.mongodb.net/${MONGO_DB}?retryWrites=true&w=majority`
const mongoClient = new MongoClient(mongoURL, {useNewUrlParser: true, useUnifiedTopology: true});



const p0 = new Promise(async (resolve, reject) => {
    let conn;
    let error = false;
    try {
        conn = await pool.getConnection();
        await conn.ping();
        //startUpServer();
        resolve(true);
    }
    catch(err) {
        error = true;
        console.info(err);
        reject(false);
    }
    finally {
        if(!error) {
            conn.release();
        }
    }
})

const p1 = new Promise(async (resolve, reject) => {
    mongoClient.connect()
        .then(result => {
            resolve(true);
        })
        .catch(error => {
            reject(false);
        });
})

const connect_to_db = (startUpServer) => {
    Promise.all([p0, p1])
        .then(result => {
            startUpServer();
        })
        .catch(err => {
            console.info("Error: Failed to connect to databases");
        })
}

const insertNewPost = async (newPost) => {
    return mongoClient.db(MONGO_DB).collection(MONGO_COLLECTION).insertOne(newPost)
        .then(result => {
            return result.ops[0];
        })
        .catch(err => {
            console.log(error);
            return {};
        })
}

const getOnePost = async (postId) => {
    const objId = new ObjectId(postId);
    return mongoClient.db(MONGO_DB).collection(MONGO_COLLECTION).find({_id: objId})
        .toArray();
}

const getAllPosts = async (user_id) => {
    return mongoClient.db(MONGO_DB).collection(MONGO_COLLECTION).find({user_id: user_id})
        .toArray();
}

const searchPosts = async (searchTermArray) => {
    return mongoClient.db(MONGO_DB).collection(MONGO_COLLECTION).find({tags: {$in: searchTermArray}})
        .toArray();
}

module.exports = {
    pool, authenticateUser, connect_to_db, insertNewPost, getOnePost, getUserQuery, getUserFollowers, getUserFollowing, getAllPosts, searchPosts, setNewFollower, unfollowUser
}