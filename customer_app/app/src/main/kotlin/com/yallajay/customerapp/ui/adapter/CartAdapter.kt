package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.yallajay.customerapp.databinding.ItemCartBinding
import com.yallajay.customerapp.model.CartItem

class CartAdapter(
    private var cartItems: List<CartItem>,
    private val onIncrease: (CartItem) -> Unit,
    private val onDecrease: (CartItem) -> Unit,
    private val onDelete: (CartItem) -> Unit
) : RecyclerView.Adapter<CartAdapter.CartViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CartViewHolder {
        val binding = ItemCartBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return CartViewHolder(binding, onIncrease, onDecrease, onDelete)
    }

    override fun onBindViewHolder(holder: CartViewHolder, position: Int) {
        val item = cartItems[position]
        holder.bind(item)
    }

    override fun getItemCount(): Int = cartItems.size

    fun updateData(newCartItems: List<CartItem>) {
        this.cartItems = newCartItems
        notifyDataSetChanged()
    }

    class CartViewHolder(
        private val binding: ItemCartBinding,
        private val onIncrease: (CartItem) -> Unit,
        private val onDecrease: (CartItem) -> Unit,
        private val onDelete: (CartItem) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: CartItem) {
            binding.productNameTextView.text = item.productName
            binding.productPriceTextView.text = item.productPrice
            binding.quantityTextView.text = item.quantity.toString()

            // The image loading code has been removed to match the layout.

            binding.increaseQuantityButton.setOnClickListener { onIncrease(item) }
            binding.decreaseQuantityButton.setOnClickListener { onDecrease(item) }
            binding.deleteItemButton.setOnClickListener { onDelete(item) }
        }
    }
}
