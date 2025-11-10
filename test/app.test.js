const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

// Verify chai-http is loaded correctly
if (typeof chaiHttp !== 'function') {
  throw new Error('chai-http is not a function. Check installation or module compatibility.');
}
chai.use(chaiHttp);

const serverUrl = 'http://localhost:3000';

const testUser = {
  userName: 'TestUser',
  email: 'testuser@example.com',
  password: 'TestPass123',
  confirmPassword: 'TestPass123',
};

let userId;

describe('API Tests for http://localhost:3000/', () => {
  // Ensure server is running before tests
  before((done) => {
    chai
      .request(serverUrl)
      .get('/health') // Ensure your server has a /health endpoint or remove this
      .end((err, res) => {
        if (err) {
          console.error('Server not running or unreachable:', err);
          return done(err);
        }
        expect(res).to.have.status(200); // Optional: Assert health check
        done();
      });
  });

  it('POST /signup - should create a new user', (done) => {
    chai
      .request(serverUrl)
      .post('/signup')
      .send(testUser)
      .end((err, res) => {
        if (err) return done(err);
        expect(res).to.have.status(201);
        expect(res.body).to.have.property('userId');
        userId = res.body.userId;
        done();
      });
  });

  it('POST /checkpassword - should validate password', (done) => {
    chai
      .request(serverUrl)
      .post('/checkpassword')
      .send({ email: testUser.email, password: testUser.password })
      .end((err, res) => {
        if (err) return done(err);
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('valid', true);
        done();
      });
  });

  it('GET /users/:id - should get user by ID', (done) => {
    if (!userId) return done(new Error('userId not set from signup'));
    chai
      .request(serverUrl)
      .get(`/users/${userId}`)
      .end((err, res) => {
        if (err) return done(err);
        expect(res).to.have.status(200);
        expect(res.body).to.have.property('_id');
        done();
      });
  });

  it('DELETE /users/:id - should delete user', (done) => {
    if (!userId) return done(new Error('userId not set from signup'));
    chai
      .request(serverUrl)
      .delete(`/users/${userId}`)
      .send({ email: testUser.email })
      .end((err, res) => {
        if (err) return done(err);
        expect(res).to.have.status(200);
        done();
      });
  });
});