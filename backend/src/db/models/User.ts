import { Schema, model } from 'mongoose';

const UserSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    name: String,
    email: String,
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    cart: [
      {
        productId: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
      },
    ],
  },
  { timestamps: true }
);

export const User = model('User', UserSchema);
