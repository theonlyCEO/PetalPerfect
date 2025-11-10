const axios = require('axios');
const { chai } = require('chai');
const { faker } = require('@faker-js/faker');

describe('POST API Request Tests', async () => {
  it('should be able to post  details', async () => {
    const res = await axios.post('http://localhost:3000/payments?email=mark@gmail.com',{
  "orderId": "ObjectId('ORD1')",
  "paymentMethod": "Credit Card",
  "amountPaid": 399.99,
  "paymentStatus": "Successful",
  "paymentDate": "2024-04-01T13:00:00Z"
}  );
    console.log(res.data);
   
  });
});