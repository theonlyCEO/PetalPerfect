const axios = require('axios');
const { expect } = require('chai');

describe('API request tests', async() => {
    it('should be able to get user list', async() => {
        const res = await axios.get('http://localhost:3000/products',
            
       
            
        );
        console.log(res.data);
       
    });
});
