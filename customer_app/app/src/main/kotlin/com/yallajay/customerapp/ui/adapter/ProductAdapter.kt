package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.yallajay.customerapp.databinding.ItemProductBinding
import com.yallajay.customerapp.model.Product

class ProductAdapter(
    private var products: List<Product>,
    private val onQuantityChanged: (product: Product, newQuantity: Int) -> Unit
) : RecyclerView.Adapter<ProductAdapter.ProductViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ProductViewHolder {
        val binding = ItemProductBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ProductViewHolder(binding, onQuantityChanged)
    }

    override fun onBindViewHolder(holder: ProductViewHolder, position: Int) {
        val product = products[position]
        holder.bind(product)
    }

    override fun getItemCount(): Int = products.size

    fun updateData(newProducts: List<Product>) {
        this.products = newProducts
        notifyDataSetChanged()
    }

    class ProductViewHolder(
        private val binding: ItemProductBinding,
        private val onQuantityChanged: (product: Product, newQuantity: Int) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        private var currentQuantity = 0

        fun bind(product: Product) {
            // Bind basic data
            binding.productNameTextView.text = product.name
            val priceText = String.format("%,.0f ل.س", product.price)
            binding.productPriceTextView.text = priceText
            binding.stockQuantityTextView.text = "المتوفر: ${product.stockQuantity}"
            
            binding.productImageView.load(product.imageUrl) {
                crossfade(true)
            }

            // Set initial state based on currentQuantity
            updateButtonsVisibility()

            // Click Listeners
            binding.initialAddButton.setOnClickListener {
                currentQuantity = 1
                updateUiForQuantityChange()
                onQuantityChanged(product, currentQuantity)
            }

            binding.increaseQuantityButton.setOnClickListener {
                if (currentQuantity < product.stockQuantity) {
                    currentQuantity++
                    updateUiForQuantityChange()
                    onQuantityChanged(product, currentQuantity)
                }
            }

            binding.decreaseQuantityButton.setOnClickListener {
                if (currentQuantity > 0) {
                    currentQuantity--
                    updateUiForQuantityChange()
                    onQuantityChanged(product, currentQuantity)
                }
            }
        }

        private fun updateUiForQuantityChange() {
            binding.quantityTextView.text = currentQuantity.toString()
            updateButtonsVisibility()
        }

        private fun updateButtonsVisibility() {
            if (currentQuantity == 0) {
                binding.initialAddButton.visibility = View.VISIBLE
                binding.quantitySelectorLayout.visibility = View.GONE
            } else {
                binding.initialAddButton.visibility = View.GONE
                binding.quantitySelectorLayout.visibility = View.VISIBLE
            }
        }
    }
}
