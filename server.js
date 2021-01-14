const express = require('express');
const morgan = require('morgan');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const {pool, authenticateUser, connect_to_db, insertNewPost, getOnePost, getUserQuery, getUserFollowers, getUserFollowing, getAllPosts, searchPosts, setNewFollower, unfollowUser} = require('./db_utils');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch')
const withQuery = require('with-query').default

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const API_KEY = process.env.API_KEY || ''
const WEATHER_URL = 'http://api.weatherapi.com/v1/current.json'
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;
const app = express();

passport.use(
    new LocalStrategy(
        {
            usernameField: 'username',
            passwordField: 'password',
            passReqToCallback: true
        },
        async (req, username, password, done) => {
            //perform the authentication
            const result = await authenticateUser([username, password]);
            const authResult = (result.length != 0);
            if(authResult) {
                done(null,
                    {
                        username: result[0]['user_id'],
                        loginTime: (new Date()).toString(),
                        profileName: result[0]['profile_name'],
                        country: result[0]['country']
                    }
                )
                return;
            }
            //incorrect login
            done('Incorrect username and password', false);
        }
    )
);

const makePassportAuth = (passport) => {
    return (req, resp, next) => {
        passport.authenticate('local',
            (err, user, info) => {
                if(null != err || !user) {
                    resp.status(401);
                    resp.json({error: err});
                    return;
                }
                req.user = user;
                next();
            }
        )(req,resp,next);
    }
}
const localStrategyPassport = makePassportAuth(passport);

const checkToken = (req, resp, next) => {
    //check if the request has authorization header
    const auth = req.get('Authorization');
    if(null == auth) {
        resp.status(403);
        resp.json({message: 'Cannot access'});
        return;
    }
    const terms = auth.split(' ');
    if(terms.length < 2 || terms[0] != 'Bearer') {
        resp.status(403);
        resp.json({message: 'Cannot access'});
        return;
    }
    const token = terms[1];
    try{
        const verify = jwt.verify(token, TOKEN_SECRET);
        req.token = verify;
        next();
    }
    catch(err) {
        console.info(err);
        resp.status(403);
        resp.json({message: 'incorrect token', error: err});
        return;
    }
}

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.use(express.static(__dirname + '/frontend'))

app.get('/api/weather',
    checkToken,
    async (req, resp) => {
        const country = req.query.country;
        const url = withQuery(WEATHER_URL, {
            key: API_KEY,
            q: country
        })

        try{
            const result = await fetch(url)
            const weatherResult = await result.json()
            resp.status(200)
            resp.json(weatherResult)
        }
        catch(err) {
            resp.status(500)
            resp.json({err})
        }
    }
)

app.get('/api/posting',
    checkToken,
    async (req, resp) => {
        const postId = req.query.postId;
        const result = await getOnePost(postId)
        result[0].tags = result[0].tags.map(v => "#" + v).join()
        if(result.length === 0) {
            resp.status(404)
            resp.json({message: "No posting found!"})
        }
        else {
            resp.status(200)
            resp.type("application/json")
            resp.json(result[0])
        }
    }
)

app.get('/api/user/:userId',
    checkToken,
    async (req, resp) => {
        const userId = req.params.userId;
        const result = await getUserQuery(userId);
        if(result.length === 0) {
            resp.status(404)
            resp.json({message: "Not found!"})
        }
        else {
            resp.status(200)
            resp.json(result[0])
        }
    }
)

app.get('/api/user/followers/:userId',
    checkToken,
    async (req, resp) => {
        const userId = req.params.userId;
        const result = await getUserFollowers(userId);
        console.log(result)
        resp.status(200)
        resp.json(result)
    }
)

app.get('/api/user/following/:userId',
    checkToken,
    async (req, resp) => {
        const userId = req.params.userId;
        const result = await getUserFollowing(userId);
        console.log(result)
        resp.status(200)
        resp.json(result)
    }
)

app.get('/api/all_postings/:userId',
    checkToken,
    async (req, resp) => {
        const userId = req.params.userId;
        const result = await getAllPosts(userId);
        for(i = 0; i < result.length; i++) {
            result[i].tags = result[i].tags.map(v => "#" + v).join()
        }
        console.log(result)
        resp.status(200)
        resp.json(result)
    }
)

app.post('/api/login',
    localStrategyPassport,
    (req, resp) => {
        console.info('user: ', req.user);
        //generate JWT Token
        let currTime = new Date().getTime() / 1000
        const token = jwt.sign({
            sub: req.user.username,
            iss: 'gemm',
            iat: currTime,
            exp: currTime + (60 * 60),
            data: {
                loginTime: req.user.loginTime
            }
        }, TOKEN_SECRET);

        resp.status(200);
        resp.json({message: `Login at ${new Date()}`, token, profileName: req.user.profileName, user_id: req.user.username, country: req.user.country});
    }
);

app.post('/api/create',
    checkToken,
    async (req, resp) => {
        const user = req.token.sub;
        let newPost = req.body;
        let tags = newPost.tags.toLowerCase().split("#").filter(v => v !== '');
        newPost['tags'] = tags;
        newPost['user'] = user;
        newPost['datetime'] = new Date().toString();

        const result = await insertNewPost(newPost);
        if(Object.keys(result).length === 0) {
            resp.status(500)
            resp.json({message: "Operation failed."})
        }
        else {
            resp.status(200)
            resp.type("application/json")
            resp.json(result)
        }
        
    }
)

app.post('/api/search/',
    checkToken,
    async (req, resp) => {
        const searchString = req.body.searchString.toLowerCase();
        const searchTermArray = searchString.split("#").filter(v => v !== '');
        const result = await searchPosts(searchTermArray)
        for(i = 0; i < result.length; i++) {
            result[i].tags = result[i].tags.map(v => "#" + v).join()
        }
        resp.status(200)
        resp.json(result)
    }
)

app.post('/api/follow/',
    checkToken,
    async (req, resp) => {
        const currentUser = req.body.currentUser;
        const followUser = req.body.followUser;
        const result = await setNewFollower([currentUser, followUser]);
        console.log(result)
        if(result.affectedRows == 0) {
            resp.status(500)
            resp.json({message: "Failed to update"})
        }
        else {
            resp.status(200)
            resp.json(result)
        }
    }
)

app.post('/api/unfollow/',
    checkToken,
    async (req, resp) => {
        const currentUser = req.body.currentUser;
        const followUser = req.body.followUser;
        const result = await unfollowUser([currentUser, followUser])
        console.log(result)
        if(result.affectedRows == 0) {
            resp.status(500)
            resp.json({message: "Failed to update"})
        }
        else {
            resp.status(200)
            resp.json(result)
        }
    }
)

connect_to_db(() => {
    app.listen(PORT, () => {
        console.info(`App has started on port ${PORT} at ${new Date()}`);
    })
});